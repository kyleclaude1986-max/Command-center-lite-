# Deploying the gym tracker

Ubuntu VPS, Node 20+, nginx, pm2, Certbot. One process, one SQLite file, one
user. The whole thing is a directory you can copy.

---

## 1. Before you touch the server

Two things need to exist first, because the app cannot make them for you:

- **A DNS A record** pointing your subdomain (say `gym.zdesigntile.com`) at the
  VPS. Certbot will not issue a certificate until this resolves.
- **A calendar named `Workouts`** in the Calendar app on your iPhone. Creating
  a calendar over CalDAV is inconsistently supported and iCloud is particularly
  fussy about it — one made that way often will not show on the phone, so the
  app refuses to guess and asks you to make it yourself.

You will also want, ready to paste:

- An **app-specific password** from appleid.apple.com. Not your Apple ID
  password — a regular one will fail with a bare 401 and no explanation.
- A **USDA FoodData Central key** (free, instant) if you want USDA results
  alongside Open Food Facts. Optional; food search works without it.
- An **Anthropic API key** if you want Claude to build your strength sessions.
  Optional; without it, planning falls back to a deterministic generator.

---

## 2. System packages

```bash
sudo apt update
sudo apt install -y nginx sqlite3 build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

`build-essential` and `python3` are not optional: `better-sqlite3` is a native
module and compiles on install. `sqlite3` is only for poking at the database by
hand — the backup does not use it.

---

## 3. The app

```bash
sudo mkdir -p /srv/gym && sudo chown "$USER" /srv/gym
git clone <your repo> /srv/gym
cd /srv/gym
npm ci
mkdir -p data logs
chmod 700 data
```

Plain `npm ci`, not `npm ci --omit=dev`. The migration, seed, and backup
scripts all run through `tsx`, which is a dev dependency.

---

## 4. Environment

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Fill it in. Three of these have traps in them:

**`AUTH_PASSWORD_HASH` — escape every dollar sign.**

```bash
npm run hash-password -- 'your password here'
```

That prints a ready-to-paste `AUTH_PASSWORD_HASH=...` line with the escaping
already applied. Paste it exactly as printed. A bcrypt hash starts `$2b$12$`,
and a bare `$` in a `.env` file is read as a variable reference — the three
dollar signs expand to nothing, a 60-character hash silently arrives as 53, and
every sign-in fails with no clue why. Quoting does not help; the expansion runs
after parsing. Each one has to be `\$`. The app now refuses to start on a
malformed hash rather than failing at the login screen, so you will find out
immediately either way.

**`ENCRYPTION_KEY` — keep a copy somewhere else.**

```bash
npm run gen-secret
```

This encrypts your progress photos at rest. Lose it and every photo is gone,
including the ones in your backups — the backup archive contains the encrypted
files, not the images. Base64 or hex both work.

**`NEXTAUTH_URL` — the full public URL**, `https://gym.zdesigntile.com`, no
trailing slash. Sign-in redirects break in confusing ways if this is wrong.

---

## 5. Database

```bash
npm run db:migrate
npm run db:seed
```

Seeding is idempotent — it fills in workout types, goals, recovery types, the
exercise library, and the rest-day macro target only where they are missing, so
it is safe to re-run after an upgrade.

---

## 6. Build and start

```bash
npm run build
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup       # prints one command to run with sudo, so pm2 survives reboot
```

Check it: `curl -I localhost:3001/login` should be a 200.

One instance, deliberately. SQLite is a single-writer file and a second worker
would fight the first for the lock.

---

## 7. nginx and TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/gym
sudo sed -i 's/gym.example.com/gym.zdesigntile.com/' /etc/nginx/sites-available/gym
sudo ln -s /etc/nginx/sites-available/gym /etc/nginx/sites-enabled/gym
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gym.zdesigntile.com
```

The config raises `client_max_body_size` to 20M for photo uploads and the proxy
timeout to 120s — a Claude-generated workout can take longer than nginx's 60s
default, and the browser would otherwise see a 504 for a session that was
actually being built.

---

## 8. Backups

```bash
crontab -e
# 15 3 * * * /srv/gym/deploy/backup.sh >> /srv/gym/logs/backup.log 2>&1
```

It takes an online snapshot through SQLite's own backup API rather than copying
the file, tars the photo directory, keeps 30 days, and copies `.env.local`
alongside so a restore has the encryption key with it.

The snapshot detail matters more than it sounds. In WAL mode the most recent
writes live in the `-wal` file, so a plain `cp` of the main database silently
loses them — the first real run of this script, back when it had a `cp`
fallback, produced a backup missing half the workouts and every single set. It
now goes through the driver, so there is no fallback path left to get wrong.

Run it once by hand and check the snapshot against the live database:

```bash
./deploy/backup.sh
```

A backup you have never restored from is a hope, not a backup.

**Restoring** is a file copy: `pm2 stop gym`, put `gym.sqlite` and the photos
directory back, `pm2 start gym`. No import step, nothing to replay.

---

## 9. Connecting the phone

**Health Auto Export** (App Store). Add a REST API automation:

| Field | Value |
|---|---|
| URL | `https://gym.zdesigntile.com/api/health/ingest` |
| Method | POST |
| Format | JSON |
| Header | `Authorization: Bearer <HEALTH_INGEST_TOKEN>` |
| Data | Workouts, Active Energy, Resting Energy, Weight, Body Fat Percentage, Lean Body Mass |

Set it to run daily, or hourly if you want net calories to move during the day.
Re-sending the same window is free: workouts dedupe on their Apple Health id,
and a day's energy is replaced rather than added to.

**Install to the home screen.** Open the site in Safari, Share, Add to Home
Screen. It runs full-screen, and the barcode scanner needs the installed app on
iOS — Safari tabs do not always get camera access.

---

## 10. First run

In the app:

1. Sign in. Wrong email or wrong password should both be refused.
2. **Admin > Calendar** — tick the calendars to scan for booked classes, then
   Save and sync now. A workout you log should appear in the Workouts calendar
   on your phone within a minute.
3. **Admin > Macro targets** — set the rest-day default, then any workout type
   that should eat differently.
4. **Admin > Supplements** — add your stack and the times of day.
5. **Plan > Edit week** — set what each weekday is, then Fill calendar.

Then check the parts that could only be guessed at from here:

- Log a workout and confirm the event lands on the right day at the right time.
- End a real workout on the Watch, wait for the export, and confirm the
  duration attaches to the session you logged rather than creating a second one.
- Search for a food by name and scan a barcode. **This is the one worth doing
  early** — the remote half of food search could not be exercised during the
  build, because the build sandbox blocked outbound access to
  openfoodfacts.org. The parsers are covered by tests against captured
  responses, but the live call has never run.
- Take a progress photo, then confirm the file on disk is unreadable:
  `head -c 8 data/photos/*.enc | xxd` should be noise, not a PNG or JPEG header.

---

## Upgrading

```bash
cd /srv/gym
git pull
npm ci
npm run db:migrate
npm run build
pm2 restart gym
```

Run `npm run verify` after a pull if you want the full check suite — it runs
against a scratch database and never touches your data.

---

## When something is wrong

```bash
pm2 logs gym --lines 100
pm2 restart gym
```

- **Sign-in refuses a password you know is right** — the dollar signs in
  `AUTH_PASSWORD_HASH`. Re-run `npm run hash-password` and paste the line it
  prints. The app will refuse to boot on a hash that is obviously mangled, so
  also check `pm2 logs` for that error.
- **Calendar sync fails with 401** — the Apple password is a regular one, not
  an app-specific one.
- **Calendar sync fails with "no calendar named Workouts"** — it does not exist
  yet, or the name does not match exactly. The error lists what it did find.
- **Photos will not open** — `ENCRYPTION_KEY` changed. Photos written under the
  old key cannot be read under a new one. Put the old key back.
- **`npm ci` fails on better-sqlite3** — `build-essential` and `python3` are
  missing.
- **Workouts stop appearing on the calendar** — Admin > Calendar shows the
  pending count and the last run's error. "Push everything again" re-queues.

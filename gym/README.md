# Gym tracker

Kyle's training log. One screen to see the day, one tap to log a workout, and
everything else — sets, food, supplements, body composition, photos — behind
that.

Deployment lives in [`deploy/README.md`](deploy/README.md).

## What it does

**Workouts.** Log what you did in one tap: Fit Camp, Olympius, or West O
split by back, chest, legs, shoulders, and abs and calves. Walking or running,
with or without a weighted vest. Sauna and red light therapy alongside.

**Two goals, separately.** Five gym days a week and one cardio day, each with
its own weekly streak. Cardio needs 25 minutes to count. A vacation pro-rates
that week's target rather than breaking the streak — three days away turns a
five-day target into three.

**Plans.** Set what each weekday is once — the rep range, rest, how many
exercises — and the calendar fills forward eight weeks. Sessions get their
exercises built the night before or the moment you tap, so the model always
sees what you actually lifted most recently. Claude picks the movements from
your own exercise library and nothing else; with no API key, or if the call
fails, a deterministic generator takes over and you still get a workout.

**Sets.** A movement arrives with sets laid out and last time's numbers already
in them, with what you did last time shown right above.

**Food.** Search Open Food Facts and USDA, or scan a barcode. Macro targets are
per workout type — a leg day and a rest day are not the same eating day.
Protein is a floor, the rest are ceilings, and the day only counts when all
four land.

**Net calories.** Eaten minus active plus resting, from Apple Health. A day
missing either half of the burn reads unavailable rather than wrong.

**Supplements.** Your stack by time of day, logged in three taps rather than
twelve, with a day streak.

**Body.** Weight, muscle, fat, and body fat charted over ninety days. Progress
photos encrypted on disk, oldest and newest of each pose side by side.

**Calendar.** Workouts written out to a dedicated iCloud calendar; classes you
have booked read back in as one-tap confirmations.

**Admin.** Types, goals, exercises, supplements, macro targets, vacations, and
the calendar settings are all data rather than code, so nothing needs a deploy.
Same login, but you re-enter your password to get in.

## Running it locally

```bash
npm install
cp .env.example .env.local     # then fill it in — see deploy/README.md
npm run db:migrate
npm run db:seed
npm run dev                    # http://localhost:3001
```

## Checks

```bash
npm run typecheck
npm run verify                 # 294 checks against a scratch database
npm run build
```

`verify` uses its own SQLite file and a fixed date, so it never touches your
data and never drifts with the calendar.

## How it is put together

Next.js 15 App Router, TypeScript, Tailwind. SQLite via better-sqlite3 with
Drizzle. NextAuth locked to one email. Phone-first, installable to the home
screen.

Three decisions everything else rests on:

**Calendar days are `YYYY-MM-DD` text, not instants.** A gym day is a calendar
day in Central Time. Storing an instant makes streaks and diaries drift at
midnight and across daylight saving. Real instants — when a workout started,
when a row was created — stay unix seconds.

**Types, goals, and thresholds are data.** That is what lets the admin panel
reshape them, and why adding a workout type or changing the cardio minimum
costs nothing.

**Archive, don't delete.** Removing a workout type hides it from the log sheet
and keeps every row ever recorded against it. Deleting is blocked outright
whenever something still points at the record.

```
app/            routes; api/ has one route file per resource
components/     UI, client components marked "use client"
lib/            all the logic — nothing important lives in a component
  db/           schema, client, migrations
  calendar/     CalDAV, ICS building, two-way sync
  food/         Open Food Facts and USDA, the diary
  health/       Apple Health parsing and ingest
  ai/           workout generation
scripts/        verify, seed, hash-password, gen-secret
deploy/         nginx, pm2, backup, and the walkthrough
```

## Conventions

- No comments explaining what code does. Comments explain why, or a decision
  that is not obvious from the names.
- All times shown in America/Chicago.
- Nothing is written to a repo file that belongs in `.env.local`.

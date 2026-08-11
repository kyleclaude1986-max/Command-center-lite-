# Deploying to Hostinger VPS

These steps assume a fresh Ubuntu 22.04 VPS on Hostinger, a domain (or subdomain) pointed at the VPS public IP, and SSH access as `root`.

## 1. Harden the box

```bash
adduser deploy && usermod -aG sudo deploy
rsync -a ~/.ssh /home/deploy/ && chown -R deploy:deploy /home/deploy/.ssh
# On your local machine: ssh-copy-id deploy@YOUR_IP  (if you haven't)
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

## 2. Install Node 20, Nginx, Certbot, pm2

```bash
apt update && apt install -y curl git nginx python3-certbot-nginx build-essential
su - deploy -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
su - deploy -c 'source ~/.nvm/nvm.sh && nvm install 20 && npm i -g pm2'
```

## 3. Deploy the app

As user `deploy`:

```bash
cd ~
git clone https://github.com/kyleclaude1986-max/command-center-lite-.git command-center
cd command-center
git checkout claude/command-center-dashboard-fNKIH
npm ci
```

Create `.env.production` (copy from `.env.example`), then:

```bash
chmod 600 .env.production
# Generate password hash for NextAuth:
npm run hash-password -- 'your-password-here'
# Copy the ready-to-paste AUTH_PASSWORD_HASH= line it prints, not the bare hash.
# The dollar signs must be escaped as \$ — a bare $ in a .env file is read as a
# variable reference, which strips the $2b$12$ prefix and leaves a 53-character
# hash that fails every sign-in with no useful error.

# Create the data directory for SQLite:
sudo mkdir -p /var/lib/command-center/data
sudo chown deploy:deploy /var/lib/command-center/data

# Generate the schema + apply it:
npm run db:generate
npm run db:migrate

# Build:
npm run build
```

## 4. Start with pm2

```bash
pm2 start npm --name command-center -- start
pm2 save
pm2 startup systemd   # run the printed sudo command
```

## 5. Nginx + TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/command-center
sudo sed -i 's/command.example.com/command.YOURDOMAIN.com/' /etc/nginx/sites-available/command-center
sudo ln -sf /etc/nginx/sites-available/command-center /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d command.YOURDOMAIN.com
```

## 6. Connect the Microsoft 365 work calendars

Entra ID setup:
1. portal.azure.com → **App registrations** → **New registration**
2. Redirect URI (Web): `https://command.YOURDOMAIN.com/api/integrations/msgraph/callback`
3. Under **Certificates & secrets**, create a client secret.
4. Under **API permissions**, add Microsoft Graph → Delegated → `Calendars.Read` and `offline_access`. Grant admin consent if needed.
5. Put the Application (client) ID, Directory (tenant) ID, and client secret into `.env.production`.
6. `pm2 restart command-center`.

Then, in your browser, while signed into the dashboard:
- Visit `https://command.YOURDOMAIN.com/api/integrations/msgraph/start?label=Work%20A`
- Sign in with the first Outlook account. You'll be redirected back.
- Repeat with `?label=Work%20B` for the second account.

## 7. Connect iCloud family calendars

1. At [appleid.apple.com](https://appleid.apple.com), generate an **app-specific password** for each Apple ID.
2. Put the Apple ID emails and app passwords into `ICLOUD_A_*` / `ICLOUD_B_*` in `.env.production`.
3. If each Apple ID has multiple calendars, set `ICLOUD_A_CALENDAR_NAME` / `ICLOUD_B_CALENDAR_NAME` to the exact display name (e.g. "Family").
4. `pm2 restart command-center`.

## 8. Connect Bloom Growth

1. Put your Bloom API key and user ID into `BLOOM_API_KEY` / `BLOOM_USER_ID`.
2. `pm2 restart command-center`.
3. If the to-dos don't appear after the first sync, check `pm2 logs command-center` — the Bloom API path may have changed; adjust `fetchTodos` in `lib/integrations/bloom.ts`.

## 9. Connect NetSuite

1. In NetSuite → **Setup > Integration > Manage Integrations > New**. Enable Token-Based Authentication. Save the **Consumer Key** and **Consumer Secret**.
2. Create an Access Token for the integration under **Setup > Users/Roles > Access Tokens > New**. Save the **Token ID** and **Token Secret**.
3. Find your account ID — it's the prefix in your NetSuite URL (e.g. `1234567` or `1234567_SB1`).
4. Fill in `NETSUITE_*` in `.env.production`.
5. If Z Design is a specific subsidiary/department, fill in `NETSUITE_SUBSIDIARY_ID` / `NETSUITE_DEPARTMENT_ID`.
6. `pm2 restart command-center`.

## 10. Nightly backups

```bash
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/bin/sqlite3 /var/lib/command-center/data/app.sqlite \".backup '/var/lib/command-center/data/app-\$(date +\%F).sqlite'\" && find /var/lib/command-center/data -name 'app-*.sqlite' -mtime +7 -delete") | crontab -
```

## Troubleshooting

- `pm2 logs command-center` — app logs
- `pm2 restart command-center` — restart after changing `.env.production`
- `npx drizzle-kit studio` — inspect the SQLite database in your browser

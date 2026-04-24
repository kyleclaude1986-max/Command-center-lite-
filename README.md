# Command Center

A private, single-user dashboard that pulls your day into one glance:

- **Today + this week** — 2 Outlook work calendars (Microsoft Graph) and 2 iCloud family calendars (CalDAV), color-coded by source.
- **To-Dos** — your open to-dos from Bloom Growth.
- **Z Design sales** — current-month and YTD gross sales, plus open-estimate pipeline value from NetSuite.

Built to run on a Hostinger VPS behind Nginx + TLS, with all data cached in a local SQLite file and refreshed every 15 minutes.

## Quick start (local)

```bash
cp .env.example .env.local
# generate secrets:
openssl rand -base64 48          # -> NEXTAUTH_SECRET
openssl rand -base64 32          # -> ENCRYPTION_KEY
npm run hash-password -- 'pw'    # -> AUTH_PASSWORD_HASH

npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Then open http://localhost:3000.

## Deployment

See [`deploy/README.md`](deploy/README.md) for the full Hostinger VPS setup (Nginx, pm2, Certbot, connecting each integration).

## Architecture

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS** with a calm, paper-and-ink palette
- **SQLite** via `better-sqlite3` + **Drizzle ORM** — single-file DB
- **NextAuth** Credentials provider, locked to one allow-listed email
- **node-cron** scheduler runs inside the Next.js server (`instrumentation.ts` bootstrap)
- **AES-256-GCM** encryption for stored OAuth refresh tokens

```
app/
  page.tsx               # Dashboard
  login/page.tsx         # Sign-in
  api/
    auth/[...nextauth]/  # NextAuth handler
    sync/                # Manual refresh endpoint
    integrations/msgraph/  # One-time OAuth consent + callback
components/              # TodayPanel, WeekPanel, TodosPanel, SalesStrip, RefreshButton
lib/
  db/                    # Drizzle schema + client + migrations
  integrations/          # msgraph, icloud, bloom, netsuite
  sync/                  # scheduler + per-source drivers
  auth.ts, env.ts, crypto.ts, queries.ts, format.ts
deploy/                  # Nginx conf + step-by-step VPS setup
```

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` / `npm start` — production
- `npm run db:generate` — regenerate migrations from schema
- `npm run db:migrate` — apply migrations
- `npm run hash-password -- 'pw'` — make a bcrypt hash for NextAuth
- `npm run sync:once` — run every sync once (useful for debugging)
- `DISABLE_SCHEDULER=1 npm run dev` — start without the cron loop

## Security notes

- All API secrets live in `.env.production` (chmod 600).
- OAuth refresh tokens are AES-256-GCM encrypted at rest.
- Only a single email is allowed to sign in; everyone else is rejected even with the correct password.
- Sales and pipeline data never leave the server; the dashboard is behind NextAuth.

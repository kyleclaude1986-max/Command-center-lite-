# Command Center — Project Memory

> **For Claude (next session): start here.** This file captures everything
> needed to pick up where we left off without re-asking the user.
> Last updated: 2026-06-09.

---

## Session pickup checklist

If you're starting a fresh session, here's the fastest path back in:

1. Branch in use: `claude/command-center-dashboard-fNKIH`
2. Initial scaffold + all four integrations + UI are **committed and pushed**.
3. Kyle is in the middle of **standing up the Hostinger VPS** (he said "VPS" when I asked what to do next; he then pasted three secrets that had problems — see "What happened with the shared secrets" below).
4. Open items to push forward are in **"Open items / next steps"** below.
5. Plan file (lighter weight, the original game plan): `/root/.claude/plans/let-s-game-plan-i-linked-chipmunk.md`.

---

## Who Kyle is, and how to write

- **Kyle Schmidt**, owner/president of **Z Design Tile & Stone** (Omaha, NE).
- High-end, curated tile + natural stone showroom. Sells primarily to **interior designers** and their clients.
- Z Design is positioned as elevated and curated — **not** a commodity, not price-driven.
- Voice for any client-/designer-facing copy: **warm, professional, authentic**. Avoid corporate jargon, hype, overly polished or stylized tone.

**Confidentiality (organization-level rule):**

- NetSuite data, revenue figures, designer/specifier performance, client contacts, project addresses, vendor pricing — all confidential. **Never include in shareable outputs.**
- No legal/contract advice — refer to Kyle.
- Treat secrets as one-way: never echo back, never write to repo files.

---

## What this app does

Kyle wants one screen he can glance at to run his day. It surfaces:

1. **Today** — events from 4 calendars (2 Outlook work, 2 iCloud family), color-coded by source, in Central Time.
2. **This week** — 7-day strip with the same color coding.
3. **Bloom Growth to-dos** — Kyle's open to-dos only (not rocks, not issues — keeping it simple per Kyle's explicit ask).
4. **Z Design sales snapshot** — YTD gross, MTD gross, and pipeline value.

---

## Decisions locked in (from Q&A with Kyle)

| Area | Decision |
|---|---|
| Hosting | Hostinger **VPS** (Ubuntu) |
| Stack | **Next.js 15 + TypeScript** (App Router) |
| Work calendars | 2x Outlook via **Microsoft Graph** |
| Family calendars | 2x iCloud via **CalDAV** (Apple app-specific password) |
| Bloom items | **To-dos only** (rocks/issues deferred) |
| Pipeline metric | **Open estimates** in NetSuite, status NOT IN (`EstimateClosed`, `EstimateProcessed`, `EstimateVoided`). Expired is included. |
| Sales refresh | **Every 15 minutes** |
| Users | **Single user**, Kyle only (NextAuth allow-list of one email) |
| Time zone | **America/Chicago** (Omaha) |

---

## Stack & key choices

- **Next.js 15.5.15** + TypeScript, App Router
- **Tailwind CSS** with a paper/ink palette + per-source calendar colors:
  - `cal.workA = #1e6091` (blue)
  - `cal.workB = #4a7c59` (green)
  - `cal.famA  = #c97b63` (terracotta)
  - `cal.famB  = #8a5a83` (plum)
- **SQLite** via `better-sqlite3` + **Drizzle ORM** — single-file DB, easy to back up
- **NextAuth** Credentials provider, locked to the one `AUTH_ALLOWED_EMAIL`
- **AES-256-GCM** for OAuth refresh tokens at rest (`lib/crypto.ts`)
- **node-cron** scheduler at `*/15 * * * *`, started lazily on first page render via `lib/sync/bootstrap.ts` (server-only side-effect; do NOT put this in `instrumentation.ts` — that bundles for edge runtime and breaks the better-sqlite3 build)
- **pm2** for the prod process on the VPS, **Nginx** reverse proxy, **Certbot** for TLS

---

## File map (the important ones)

```
app/
  page.tsx                                # Dashboard (Today + Week + Sales + To-Dos)
  layout.tsx, providers.tsx               # Root + SessionProvider
  login/page.tsx                          # Sign-in
  api/
    auth/[...nextauth]/route.ts           # NextAuth handler
    sync/route.ts                         # POST /api/sync[?source=netsuite|bloom|...]
    integrations/msgraph/
      start/route.ts                      # /api/integrations/msgraph/start?label=Work%20A
      callback/route.ts                   # OAuth code exchange + token save

components/
  TodayPanel.tsx, WeekPanel.tsx, TodosPanel.tsx, SalesStrip.tsx, RefreshButton.tsx

lib/
  env.ts                                  # zod-validated env loader
  auth.ts                                 # NextAuth options
  crypto.ts                               # AES-256-GCM helpers
  queries.ts                              # Server-side data fetchers used by the dashboard
  format.ts                               # fmtTime, fmtDate, fmtCurrency, calendarColor, ...
  db/
    schema.ts                             # Drizzle tables
    client.ts                             # SQLite + drizzle instance
    migrate.ts                            # Apply migrations
  integrations/
    netsuite.ts                           # SuiteQL + 3 metric queries + syncNetsuite()
    msgraph.ts                            # OAuth refresh + calendarView + syncMsgraphCalendar()
    icloud.ts                             # tsdav + ical.js + syncIcloudCalendar()
    bloom.ts                              # fetchTodos + syncBloomTodos()
  sync/
    sources.ts                            # syncAll() + syncOne(source)
    scheduler.ts                          # node-cron registration
    bootstrap.ts                          # server-only side-effect; imported by app/page.tsx

scripts/
  hash-password.ts                        # npm run hash-password -- 'pw' -> bcrypt hash
  sync-once.ts                            # npm run sync:once

deploy/
  nginx.conf                              # Reverse-proxy server block
  README.md                               # Full VPS bring-up walkthrough

drizzle/0000_odd_red_shift.sql            # Initial migration
.env.example                              # Every secret documented
```

---

## How sync works

- A single 15-min cron in `lib/sync/scheduler.ts` calls `syncAll()`.
- `syncAll()` fans out into per-source jobs, each wrapped by `run(source, fn)` which records start/finish/status/error rows in `sync_runs`.
- The window is **Monday of this week → 14 days ahead** (2-week buffer so the Week panel is always populated).
- Each calendar source **wipes its rows for that label** and re-inserts. To-dos are similarly wiped and re-inserted (open ones only).
- NetSuite stores three rows in `netsuite_metrics` keyed by `metric_key`.
- The UI reads only from SQLite (instant). Manual refresh buttons hit `POST /api/sync?source=...` which calls the same sync function inline.

---

## NetSuite specifics

- Auth: **Token-Based Authentication (TBA)** — consumer + token pairs, OAuth 1.0a HMAC-SHA256 signed in `lib/integrations/netsuite.ts`.
- Transport: SuiteQL via `POST /services/rest/query/v1/suiteql`.
- Endpoint host is built from `NETSUITE_ACCOUNT_ID` (e.g. `1234567` → `https://1234567.suitetalk.api.netsuite.com`).
- Gross sales currently = `SUM(netamount)` of `CustInvc + CashSale` minus `CustCred`, posting='T', within the date range. Confirm against a known monthly report after first connection — flag in the "open items" if anything looks off.
- Pipeline = `SUM(netamount)` of `Estimate` where status NOT IN (`EstimateClosed`, `EstimateProcessed`, `EstimateVoided`).
- `NETSUITE_SUBSIDIARY_ID` / `NETSUITE_DEPARTMENT_ID` add `AND t.subsidiary = X` / `AND t.department = Y` filters when set. Leave blank if not multi-subsidiary.

---

## Microsoft Graph specifics

- One-time consent per account via browser at `/api/integrations/msgraph/start?label=Work%20A` (and `Work%20B`).
- Scopes: `offline_access Calendars.Read User.Read`.
- Refresh tokens stored encrypted in `oauth_accounts` (one row per label).
- Calendar fetch uses `/me/calendarView` with the `Prefer: outlook.timezone="UTC"` header — expands recurring events for the window.

---

## iCloud CalDAV specifics

- Apple ID + **app-specific password** (from appleid.apple.com). NOT a regular Apple ID password.
- Uses `tsdav` against `https://caldav.icloud.com` with Basic auth.
- If an Apple ID has multiple calendars, set `ICLOUD_A_CALENDAR_NAME` to the exact display name (e.g. `Family`). If blank, all VEVENT-supporting calendars on that account are merged.
- Recurrence expansion + `EXDATE` handling is done with `ical.js` (see `expandVEvent`).
- Capped at 500 occurrences per series to be safe.

---

## Bloom Growth specifics

- **API path likely needs adjustment on first deploy.** Bloom's API docs aren't fully public; the code defaults to `/api/v1/users/{BLOOM_USER_ID}/todos?archived=false` and tries to handle multiple response envelopes (`[...]`, `{items: [...]}`, `{data: [...]}`).
- Auth: `Authorization: Bearer ${BLOOM_API_KEY}`.
- If first call returns 401/404, inspect `pm2 logs` and adjust `fetchTodos()` in `lib/integrations/bloom.ts`.
- Normalization tolerates several field names (`name|title`, `dueDate|due`, `complete|isComplete|completed|status`).

---

## What happened with the shared secrets

Kyle pasted three secrets in chat that all needed adjustments:

1. `NEXTAUTH_SECRET` — format OK (base64), but **now in chat history**.
2. `ENCRYPTION_KEY` — was **hex (64 chars)**, but `lib/crypto.ts` decodes as base64 and requires 32 bytes after decode. Two paths: regenerate as `openssl rand -base64 32`, OR patch `lib/crypto.ts` to accept either format.
3. `AUTH_PASSWORD_HASH` — **truncated to 53 chars**; a valid `$2b$12$…` bcrypt hash is exactly 60 chars. Re-run `npm run hash-password -- 'pw'` and copy the full output.

**I told him to regenerate all three** because anything pasted in chat is logged. I have not received confirmation that he did.

**Next session note**: do not echo any secret values back to him; just confirm by name when they're set.

---

## Current state (as of 2026-06-09)

- Branch `claude/command-center-dashboard-fNKIH` — initial commit pushed (`2262cf3`).
- `npx tsc --noEmit` — passes.
- `npx next build` — passes.
- Smoke test:
  - `GET /` (unauth) → 307 to `/login?callbackUrl=%2F` ✓
  - `GET /login` → 200 ✓
  - `POST /api/sync` (unauth) → 307 to `/login` ✓
- 212 npm packages installed. Next.js bumped from `15.1.3` → `15.5.15` for CVE-2025-66478.
- `drizzle/0000_odd_red_shift.sql` generated and applied locally without issues.

---

## Open items / next steps

These are deferred to "first live deploy" and need either info from Kyle or a quick adjustment in code once the VPS is reachable.

1. **Domain / subdomain** — what hostname will the dashboard live at? (e.g., `command.zdesigntile.com`) Needed for Nginx + Certbot.
2. **Entra ID app registration** — Kyle needs to create one in Azure portal, set redirect URI to `{NEXTAUTH_URL}/api/integrations/msgraph/callback`, grant admin consent for `Calendars.Read` + `offline_access`. Then walk through `?label=Work%20A` + `?label=Work%20B`.
3. **iCloud calendar display names** — if either Apple ID has multiple calendars, set `ICLOUD_A_CALENDAR_NAME` / `ICLOUD_B_CALENDAR_NAME` to the exact name.
4. **Bloom to-do endpoint** — confirm against live API; adjust `lib/integrations/bloom.ts:fetchTodos` if shape differs.
5. **NetSuite scoping** — confirm whether Z Design needs a subsidiary or department filter; set `NETSUITE_SUBSIDIARY_ID` / `NETSUITE_DEPARTMENT_ID` if yes.
6. **Gross sales definition** — once connected, compare SuiteQL "MTD gross" against a known NetSuite saved search; adjust the formula in `lib/integrations/netsuite.ts` if needed.
7. **`lib/crypto.ts` hex tolerance** — Kyle's first `ENCRYPTION_KEY` was hex. Consider patching `key()` to accept hex too, so future regenerations don't fail. Easy ~5-line change.
8. **Nightly DB backup cron** — `deploy/README.md` has the snippet; needs to actually be installed on the VPS.

---

## Verification plan (when live)

1. **Calendars** — create a known test event in each of the 4 calendars, all-day + recurring weekly. Confirm Today + Week show them with the right color + Central Time.
2. **Bloom** — add a test to-do due today; appears within 15 min or on manual refresh.
3. **NetSuite** — pull a known historical month from a saved search; compare MTD gross. Repeat YTD against a finance report. Pipeline against an "Open Estimates" saved search.
4. **Auth** — `/` unauth → `/login`; wrong password → reject; right password + wrong email → reject.
5. **Resilience** — block outbound to `graph.microsoft.com` for 5 min; UI should still render cached data, not crash.
6. **Secrets** — `git grep -E '(client_secret|api_key|password|token)'` on the repo → no hits outside `.env.example`.

---

## Conventions worth keeping in mind

- **Default to no comments in code.** Names should carry the meaning.
- **Don't echo secret values** back to Kyle. Confirm by env var name only.
- **All times shown in America/Chicago.**
- **Currency** rounded to whole dollars (`fmtCurrency` in `lib/format.ts`).
- **Brand voice** for any UI copy or designer-facing text: warm, professional, authentic.
- **No emojis** anywhere (file content or chat) unless Kyle explicitly asks.
- **GitHub repo**: `kyleclaude1986-max/command-center-lite-` (the only repo our GitHub MCP is allowed to touch in this session).
- **No Linear MCP connected** in this session — issue tracking, if needed, would have to be GitHub Issues. Kyle has not yet decided whether to use issues at all.

---

## How to start the next session

If Kyle says "let's keep going" or similar in a new session:

1. Read this file.
2. Run `git status` + `git log -5 --oneline` to confirm where we are on the branch.
3. Run `npm install` if `node_modules` is missing.
4. Ask Kyle: "Where are you in the VPS bring-up? Anything blocking, or should I patch `lib/crypto.ts` for hex/base64 flexibility first?"
5. Do NOT re-ask the decisions in the "Decisions locked in" table — those are settled.

If Kyle says "create the GitHub issues for the open items": use the items in **"Open items / next steps"** above, one issue per item.

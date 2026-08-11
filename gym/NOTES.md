# Gym tracker — where things stand

> For whoever picks this up next, including a future session.
> Last updated 2026-08-11.

## The one thing that is blocked

**This app is supposed to live in its own repo, `iron-log`.** It does not yet,
because repository creation is refused: `mcp__github__create_repository`
returns `403 Resource not accessible by integration`, and that has not changed
across several attempts.

Everything therefore lives in `gym/` on the branch
`claude/personal-gym-tracker-nflrle` in the Command Center repo, tracked by
draft PR #1. Nothing is lost, and the port is a directory move plus a fresh
`git init` once the repo exists.

**What Kyle needs to do:** create an empty private repo named `iron-log` — no
README, no `.gitignore`, no license. Then the port is:

```bash
# from a clone of this branch
git subtree split --prefix=gym -b iron-log-main
git push git@github.com:<owner>/iron-log.git iron-log-main:main
```

That keeps the commit history. A plain copy of the directory works too if the
history does not matter.

## Also worth doing regardless

Command Center **PR #1 carries the `.env` dollar-sign fix** — the actual cause
of the June login failure. Worth merging whether or not the gym app moves out.

## Built and verified

All of it, other than the port. 303 checks pass, `tsc --noEmit` is clean, the
production build succeeds, and every page and API route was exercised over
HTTP against a running server.

- Workout logging, both weekly goals, streaks, vacation pro-rating, recovery
- Admin panel: goals, types, recovery, supplements, vacations, exercises,
  macro targets, calendar, records and export
- Supplement stack with slots, schedules, and a day streak
- Weekly plan template, eight-week materialisation, per-day overrides
- Claude-generated strength sessions with a deterministic fallback
- Exercise and set logging, prefill from last time and from the plan
- Body metrics, ninety-day charts, encrypted progress photos
- Apple Health ingest, workout matching, net calories
- Food tracking, barcode scanning, saved meals
- Macro targets per workout type, nutrition streak, month calendar
- Two-way iCloud calendar sync, class confirmation
- JSON and CSV export
- Deployment: nginx, pm2, backup, and a full walkthrough

## Three things could not be exercised here, and need a real check on the VPS

The sandbox has no credentials for them and its network policy blocks the
hosts, so these are the parts that have never actually run:

1. **Remote food search and barcode lookup.** `openfoodfacts.org` is blocked at
   the proxy. Both normalisers are covered by tests against captured responses,
   and the failure path was confirmed to degrade cleanly rather than hang, but
   the live call has never happened. **Check this first** — it is the one most
   likely to need an adjustment.
2. **CalDAV push and fetch.** No Apple credentials and no outbound CalDAV.
   Event construction, ICS parsing, type guessing, the push queue, and the
   confirm flow are all tested; the network round trip is not.
3. **Apple Watch duration attaching to a real session.** The ingest endpoint
   and the matching logic are tested against captured payloads and were driven
   over HTTP, but no real phone has posted to it.

`deploy/README.md` section 10 lists these as a first-run checklist.

## Decisions that are settled — do not re-ask

| Area | Decision |
|---|---|
| Goals | Gym 5/week, cardio 1/week with a 25-minute minimum, tracked separately |
| Vacation | Pro-rates that week's target rather than breaking the streak |
| Spelling | **Olympius**. It is a strength class at iThinkFit |
| Strength types | Fit Camp, Olympius, and West O all get exercise logging |
| Planning | On for West O only by default; a checkbox in admin for the rest |
| AI generation | Lazy, the night before or on tap — never in bulk up front |
| Apple Watch | Health Auto Export posts to `/api/health/ingest` with a bearer token |
| Total calories | Net: eaten − (active + resting) |
| Macro targets | Per workout type, picked by what was logged, rest-day default |
| Nutrition streak | Day streak, all four macros must land |
| Photos | Encrypted on disk, login-gated, in the nightly backup |
| Admin | Same login, re-enter the password, proper forms not a table browser |
| Timezone | America/Chicago throughout |

## Conventions

- Calendar days are `YYYY-MM-DD` text. Real instants are unix seconds.
- Types, goals, and thresholds are data, not constants.
- Archive rather than delete. Deleting is blocked while anything points at a
  record.
- No comments explaining what code does — only why, or a non-obvious decision.
- No emojis anywhere.
- Never echo a secret value back to Kyle. Confirm by env var name only.
- Voice: warm, professional, authentic. No hype, no corporate jargon.

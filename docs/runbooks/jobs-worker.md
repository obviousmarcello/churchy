# Background jobs worker (music merge phase 8c)

The scheduled work of the music module runs in a **worker process of its own**, next to the web app: `pnpm worker`
(`apps/web/server/jobs/main.ts`, run with `tsx` and `apps/web/tsconfig.worker.json`, which turns `server-only` into an empty
module). The queues and the schedules live in the schema `pgboss` of the database ([pg-boss](https://github.com/timgit/pg-boss),
the job runner of the stack, SDD §3; it is the only dependency added for the jobs).

## Jobs (all `Europe/Budapest`; each runs for every church in turn, one church's failure never stops the others)

| Queue                     | When                           | Work                                                                                                                                                                                                    |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `music-due-notifications` | every 15 minutes               | event reminders and setlists that are due (`sendDueNotifications`; outbox entries and web push)                                                                                                         |
| `music-rights-research`   | every 10 minutes, 00:00-04:59  | AI research of the song rights: only for churches whose superadmins switched it on, with the plan's cap (`entitlements().musicResearchPerMonth`) and their nightly limit; the platform `ANTHROPIC_API_KEY` |
| `music-cleanup-hourly`    | minute 7 of each hour          | stray files, unused image sets and announcements, projection controllers not seen for 23 h, scripture verses older than a day                                                                           |
| `music-cleanup-nightly`   | 03:17                          | courses and lessons removed more than 90 days ago, course images that no course uses                                                                                                                    |
| `site-builder-purge`      | minute 23 of each hour         | deletes expired, not applied site builder drafts (`site_drafts`); uses `DATABASE_URL_PLATFORM`, does nothing without it ([site-builder.md](site-builder.md))                                              |

## Starting it

```bash
# environment of the worker (never committed; same secrets as the web app)
export DATABASE_URL=...            # or PGBOSS_DATABASE_URL, see below
export SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... SUPABASE_JWT_SECRET=...   # the music data of a church
export ANTHROPIC_API_KEY=...       # the AI research (optional: without it the research job does nothing)
export VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...     # web push (optional)
pnpm worker                        # runs until SIGTERM/SIGINT (a graceful stop)
```

Run exactly one worker process per environment (a second one is harmless: pg-boss hands each job to one worker, but
both would do the schedule bookkeeping). Under a process manager (systemd, a container) restart it on exit.

- **Connection.** `PGBOSS_DATABASE_URL`, else `DATABASE_URL`. pg-boss creates and migrates its schema `pgboss`, and holds a
  session: use a **direct connection or Supabase's session-mode pooler (port 5432), never the transaction pooler (6543)**. The worker
  also reads the list of churches (`tenants`, a platform table that the app role `churchy_app` cannot read), so the role must be
  the database owner or a role with `select` on `tenants` and `create` on the database. The data of a church is read only through that
  church's tenant token (RLS applies as in a request; `createMusicJobClient` mints a fresh token for every request).
- **Demo mode.** With `DEMO_MODE=1` the worker prints "Background jobs are off in demo mode" and exits: nothing is scheduled and no
  database is used. The demo also refuses to start with `PGBOSS_DATABASE_URL` set (`lib/demo/safety.ts`). Without a database or the
  Supabase settings it prints which one is missing and exits.
- **Outbox.** Churchy has no mail transport yet: the notification mails are appended to the outbox of the process that sends them
  (SDD §4.4), which for the worker is the worker's own process memory. They are therefore only visible in the demo (web process). Real
  delivery needs the real outbox (a table and a sender) first; push is real (web-push) when the `VAPID_*` variables are set.
- **Secrets.** The worker never logs data: lines carry counts and church ids. Nothing is committed; the keys are environment only.

## Checks

`pnpm --filter @churchy/web test` (config, per-church isolation and the job steps with fakes), `TEST_DATABASE_URL=... pnpm test:isolation`
(`list_due_notifications`, `claim_songs_for_rights_research`, course purge). Verified by hand on a disposable Postgres: the worker
starts, creates `pgboss`, registers the four schedules and dispatches a job to every church. Not verified here: a real run against a
Supabase project (no project in this environment).

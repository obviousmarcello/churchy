# Importing the production data of a church (phase 7b)

One-off operator tool, not part of the app: `packages/db/scripts/import-music-prod.ts`. It copies the music
tables of a Music Sheet DB (source Postgres) into one Churchy tenant. No data is in the repository.

```bash
SOURCE_DATABASE_URL=postgres://… DATABASE_URL=postgres://… \
  pnpm --filter @churchy/db import:music -- --tenant <tenant uuid> [--user-map map.json] [--dry-run]
```

1. **Dry run first** (`--dry-run`): one transaction, rolled back; prints per table the rows read, inserted and skipped.
2. **User map**: source `auth.users` ids are not Churchy profiles. `map.json` is `{ "<source user id>": "<Churchy profiles.id>" }`
   (match by e-mail yourself). An unmapped user reference becomes NULL; if the column is NOT NULL the row is skipped and counted.
3. **Real run**: same command without `--dry-run`. With `APP_ENV=staging|production` it also needs `--yes`.
4. **Idempotent**: `ON CONFLICT DO NOTHING` on every insert; a second run adds nothing. `tenant_id` is the given tenant; generated
   columns and columns the source lacks use the target's defaults; columns Churchy lacks are dropped and named in the report.
5. Source `events` become staff events of the tenant's music calendar (`music_calendar_id()`, slug from title, date and id).
6. **Not copied** (do by hand): files of the storage buckets (copy to `t/<tenant>/…`), `calendars`, Churchy/platform tables.
7. Afterwards run `select * from merge_songbook_hymnal_refs()` as the tenant (see PLAN §26) to link songbooks to hymnals.

Test: `packages/db/src/import-music.db.test.ts` (disposable database, run on its own).

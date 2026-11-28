/**
 * Connection of the platform role (0025_platform_role, SDD §4.2): everything that has no tenant
 * context yet — host resolution, profile bootstrap, plan lookups and creating a church. Used only by
 * `apps/web/server/platform-db` (lint-restricted); never shares `DATABASE_URL` with the app role.
 *
 * The owner creates the login role (`churchy_platform_login`, INHERIT, member of `churchy_platform`)
 * out-of-band; its URL goes into `DATABASE_URL_PLATFORM` (direct or session-mode connection).
 */
import pg from "pg";

export const PLATFORM_URL_ENV = "DATABASE_URL_PLATFORM";

/** The platform role's URL. Throws when it is missing or identical to the app role's `DATABASE_URL`. */
export function platformDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env[PLATFORM_URL_ENV]?.trim();
  if (url === undefined || url === "") throw new Error(`${PLATFORM_URL_ENV} is not set`);
  if (url === env.DATABASE_URL?.trim()) {
    throw new Error(`${PLATFORM_URL_ENV} must not be the same connection as DATABASE_URL`);
  }
  return url;
}

export function createPlatformPool(url: string = platformDatabaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 3, application_name: "churchy-platform" });
}

export class UnsafePlatformRoleError extends Error {
  constructor(role: string) {
    super(
      `The platform connection runs as "${role}", which is a superuser/BYPASSRLS role or not a member of churchy_platform`,
    );
    this.name = "UnsafePlatformRoleError";
  }
}

/** Fails unless the connection is subject to RLS and holds exactly the platform role's privileges. */
export async function assertPlatformRole(db: Pick<pg.Pool, "query">): Promise<void> {
  const { rows } = await db.query<{ role: string; ok: boolean }>(
    `select current_user as role,
            (not (rolsuper or rolbypassrls)
             and pg_catalog.pg_has_role(current_user, 'churchy_platform', 'USAGE')
             and not pg_catalog.pg_has_role(current_user, 'churchy_app', 'USAGE')
             and not pg_catalog.pg_has_role(current_user, 'churchy_music', 'USAGE')) as ok
     from pg_catalog.pg_roles where rolname = current_user`,
  );
  const row = rows[0];
  if (!row?.ok) throw new UnsafePlatformRoleError(row?.role ?? "unknown");
}

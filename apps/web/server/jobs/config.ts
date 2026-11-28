/**
 * Configuration of the background jobs (phase 8c, `pnpm worker`). Pure: takes the environment.
 *
 * The jobs run in their own process (`server/jobs/main.ts`), not in the web app. pg-boss keeps its
 * queue in the schema `pgboss` of the database; it needs a connection that can create that schema
 * and, with `LISTEN`, a session-pinned one (a direct connection or Supabase's session-mode pooler,
 * never the transaction pooler). `PGBOSS_DATABASE_URL` names it, else `DATABASE_URL` is used. The
 * worker also reads the list of churches (a platform table: `churchy_app` cannot), so the role in the
 * URL must be one that can; the data of a church is only read through that church's tenant token.
 */
export type Env = Readonly<Record<string, string | undefined>>;

export type JobsConfig =
  | { enabled: true; connectionString: string }
  | { enabled: false; reason: "demo" | "no-database" | "no-supabase" };

export const JOBS_DISABLED_NOTICE: Record<
  Extract<JobsConfig, { enabled: false }>["reason"],
  string
> = {
  demo: "Background jobs are off in demo mode: nothing is scheduled and no database is used.",
  "no-database": "Background jobs are off: neither PGBOSS_DATABASE_URL nor DATABASE_URL is set.",
  "no-supabase":
    "Background jobs are off: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_JWT_SECRET are needed to reach the music data of a church.",
};

export function jobsConfig(env: Env = process.env): JobsConfig {
  const demo = env["DEMO_MODE"];
  if (demo !== undefined && demo !== "" && demo !== "0") return { enabled: false, reason: "demo" };
  const connectionString = (env["PGBOSS_DATABASE_URL"] || env["DATABASE_URL"] || "").trim();
  if (connectionString === "") return { enabled: false, reason: "no-database" };
  if (!env["SUPABASE_URL"] || !env["SUPABASE_PUBLISHABLE_KEY"] || !env["SUPABASE_JWT_SECRET"]) {
    return { enabled: false, reason: "no-supabase" };
  }
  return { enabled: true, connectionString };
}

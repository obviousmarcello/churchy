/**
 * Demo-mode startup check (D-92 AC3, SDD §4.4 / §18).
 *
 * The demo deployment runs on mock adapters only and must hold **no** database, storage, email,
 * push or payment credentials, and the demo flag must be impossible to use in staging or
 * production. `instrumentation.ts` calls `assertDemoModeSafe(process.env)` when the server starts,
 * so `next start` / `next dev` exit before serving a single request when any rule is broken.
 *
 * Rules, checked only when `DEMO_MODE` is set:
 *  1. `DEMO_MODE` must be `1` (on) or `0`/empty (off) — any other value is refused.
 *  2. `APP_ENV` (the deployment environment: `local`, `ci`, `demo`, `staging`, `production`) must not
 *     be staging or production (`staging`, `stage`, `production`, `prod`, any letter case).
 *  3. None of the variables in `FORBIDDEN_DEMO_CREDENTIALS` may be configured (a non-empty value):
 *     an explicit list per category, plus whole prefixes for provider families.
 *  4. No module may be switched to the database adapter (`DATA_ADAPTER_<MODULE>=db`).
 *
 * An empty value counts as "not configured", so a test harness can blank an inherited variable.
 * Error messages name variables only, never their values.
 *
 * When you add a provider integration, add its credential variables here in the same PR.
 */
import { demoModeFlag, type Env } from "./flag";

export type CredentialCategory = "database" | "storage" | "email" | "push" | "payment";

export interface ForbiddenCredentials {
  /** Exact variable names. */
  readonly names: readonly string[];
  /** Every variable starting with one of these prefixes. */
  readonly prefixes: readonly string[];
}

/** The credentials a demo deployment must not have, per category (single source of truth). */
export const FORBIDDEN_DEMO_CREDENTIALS: Readonly<
  Record<CredentialCategory, ForbiddenCredentials>
> = {
  database: {
    names: [
      "DATABASE_URL",
      "DATABASE_URL_UNPOOLED",
      "DIRECT_URL",
      "POSTGRES_URL",
      "POSTGRES_PRISMA_URL",
      "POSTGRES_URL_NON_POOLING",
      "POSTGRES_PASSWORD",
      "PGPASSWORD",
      "PGHOST",
      "PGUSER",
      "PGDATABASE",
    ],
    prefixes: [],
  },
  storage: {
    names: [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN",
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "STORAGE_ENDPOINT",
      "STORAGE_BUCKET",
    ],
    prefixes: ["S3_", "MINIO_"],
  },
  email: {
    names: [
      "EMAIL_SERVER",
      "EMAIL_API_KEY",
      "EMAIL_PROVIDER_API_KEY",
      "POSTMARK_API_TOKEN",
      "POSTMARK_SERVER_TOKEN",
      "SENDGRID_API_KEY",
      "MAILGUN_API_KEY",
      "RESEND_API_KEY",
      "BREVO_API_KEY",
      "MAILJET_API_KEY",
      "MAILJET_SECRET_KEY",
    ],
    prefixes: ["SMTP_"],
  },
  push: {
    names: ["WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_PUBLIC_KEY"],
    prefixes: ["VAPID_"],
  },
  payment: {
    names: ["SZAMLAZZ_AGENT_KEY", "BILLINGO_API_KEY"],
    prefixes: ["BARION_"],
  },
};

export const CREDENTIAL_CATEGORIES = Object.keys(
  FORBIDDEN_DEMO_CREDENTIALS,
) as readonly CredentialCategory[];

/** `APP_ENV` values in which demo mode is refused. */
export const FORBIDDEN_APP_ENVS = ["staging", "stage", "production", "prod"] as const;

export type DemoSafetyProblem =
  | { kind: "invalidFlag" }
  | { kind: "environment"; appEnv: string }
  | { kind: "credential"; category: CredentialCategory; variable: string }
  | { kind: "dbAdapter"; variable: string };

const configured = (value: string | undefined): boolean =>
  value !== undefined && value.trim() !== "";

/** Every variable of `env` that belongs to a forbidden credential category. */
export function forbiddenCredentialsIn(
  env: Env,
): { category: CredentialCategory; variable: string }[] {
  const found: { category: CredentialCategory; variable: string }[] = [];
  for (const variable of Object.keys(env).sort()) {
    if (!configured(env[variable])) continue;
    for (const category of CREDENTIAL_CATEGORIES) {
      const rule = FORBIDDEN_DEMO_CREDENTIALS[category];
      if (rule.names.includes(variable) || rule.prefixes.some((p) => variable.startsWith(p))) {
        found.push({ category, variable });
        break;
      }
    }
  }
  return found;
}

/**
 * Why the server must not start with this environment (empty = safe). Demo mode off (`DEMO_MODE`
 * unset, empty or `0`) is always safe: the rules only constrain the demo deployment.
 */
export function demoSafetyProblems(env: Env): DemoSafetyProblem[] {
  const flag = demoModeFlag(env);
  if (flag === "off") return [];
  if (flag === "invalid") return [{ kind: "invalidFlag" }];

  const problems: DemoSafetyProblem[] = [];
  const appEnv = (env.APP_ENV ?? "").trim().toLowerCase();
  if ((FORBIDDEN_APP_ENVS as readonly string[]).includes(appEnv)) {
    problems.push({ kind: "environment", appEnv });
  }
  for (const hit of forbiddenCredentialsIn(env)) problems.push({ kind: "credential", ...hit });
  for (const variable of Object.keys(env).sort()) {
    if (/^DATA_ADAPTER_[A-Z0-9_]+$/.test(variable) && env[variable]?.trim() === "db") {
      problems.push({ kind: "dbAdapter", variable });
    }
  }
  return problems;
}

function describe(problem: DemoSafetyProblem): string {
  switch (problem.kind) {
    case "invalidFlag":
      return "DEMO_MODE must be 1 (on) or 0 (off)";
    case "environment":
      return `APP_ENV=${problem.appEnv}: demo mode is impossible in staging and production`;
    case "credential":
      return `${problem.variable} is set: a demo deployment has no ${problem.category} credentials`;
    case "dbAdapter":
      return `${problem.variable}=db: a demo deployment uses mock adapters only`;
  }
}

export class DemoModeSafetyError extends Error {
  constructor(readonly problems: readonly DemoSafetyProblem[]) {
    super(
      `Refusing to start with DEMO_MODE: ${problems.map(describe).join("; ")}. ` +
        "See apps/web/lib/demo/safety.ts.",
    );
    this.name = "DemoModeSafetyError";
  }
}

/** Throws `DemoModeSafetyError` when the environment breaks any demo-mode rule. */
export function assertDemoModeSafe(env: Env): void {
  const problems = demoSafetyProblems(env);
  if (problems.length > 0) throw new DemoModeSafetyError(problems);
}

/**
 * Overrides that blank every forbidden credential found in `env` (`{ NAME: "" }`), turning an
 * inherited shell environment into what a demo deployment looks like. Used by the E2E harness,
 * whose shell may carry unrelated cloud credentials.
 */
export function blankDemoCredentials(env: Env): Record<string, string> {
  const blanked: Record<string, string> = {};
  for (const { variable } of forbiddenCredentialsIn(env)) blanked[variable] = "";
  return blanked;
}

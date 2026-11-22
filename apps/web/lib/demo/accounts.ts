import type { DemoPersonaKey } from "@/lib/demo/personas";

/**
 * Demo accounts of the login page (`/belepes`): one fictitious account per demo persona, so the
 * sign-in flow can be tried without a real identity provider. Addresses are made up and use the
 * `pelda.hu` example domain; no real person or mailbox exists behind them. In demo mode any
 * non-empty password signs in (`server/auth.ts`, the mock `AuthProvider`).
 *
 * Pure and client-safe. `home` is where signing in leads (a property of the demo account, not a
 * role check): the person's main area; `server/auth.ts` still verifies it with `can()`.
 */
export type AccountHome = "admin" | "workspace" | "diocese";

export interface DemoAccount {
  readonly persona: DemoPersonaKey;
  readonly email: string;
  readonly home: AccountHome;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { persona: "tulajdonos", email: "lajos.tulajdonos@pelda.hu", home: "admin" },
  { persona: "szerkeszto", email: "eszter.szerkeszto@pelda.hu", home: "admin" },
  { persona: "iroda", email: "ilona.iroda@pelda.hu", home: "admin" },
  { persona: "vezeto", email: "gabor.vezeto@pelda.hu", home: "workspace" },
  { persona: "onkentes", email: "peter.onkentes@pelda.hu", home: "workspace" },
  { persona: "csoportvezeto", email: "anna.csoportvezeto@pelda.hu", home: "workspace" },
  { persona: "zenei", email: "zoltan.zenei@pelda.hu", home: "workspace" },
  { persona: "terem", email: "tamas.terem@pelda.hu", home: "workspace" },
  { persona: "hr", email: "hajnalka.hr@pelda.hu", home: "workspace" },
  { persona: "bizalmas", email: "bela.bizalmas@pelda.hu", home: "workspace" },
  { persona: "egyhazmegyeiHr", email: "dora.egyhazmegyei@pelda.hu", home: "diocese" },
  { persona: "egyhazmegyeiUgyintezo", email: "csilla.ugyintezo@pelda.hu", home: "diocese" },
];

/** Trimmed, lower-case address, the form accounts are compared in. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** The demo account with this address, or null. */
export function demoAccountByEmail(value: string): DemoAccount | null {
  const email = normalizeEmail(value);
  return DEMO_ACCOUNTS.find((a) => a.email === email) ?? null;
}

/** The area route of an account's home. */
export const HOME_PATH: Record<AccountHome, string> = {
  admin: "/admin",
  workspace: "/munkater",
  diocese: "/egyhazmegye",
};

/** A syntactically plausible e-mail address (the real check is the identity provider's). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

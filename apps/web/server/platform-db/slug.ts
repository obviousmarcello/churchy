import { slugify } from "@churchy/hu";

/**
 * Church slugs are DNS labels on `<slug>.churchy.hu` and `<slug>.<neutral domain>.hu` (SDD §4.1) and
 * share the namespace of organization slugs. Words below name platform routes, hosts or services
 * and can never be a church.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // platform hosts and routes (SDD §4.1, §6, §11)
  "www",
  "platform",
  "admin",
  "api",
  "app",
  "belepes",
  "kilepes",
  "munkater",
  "egyhazmegye",
  "fejlesztes",
  "demo",
  "dev",
  "test",
  "staging",
  "stage",
  "prod",
  "production",
  "preview",
  "churchy",
  // auth and account flows
  "login",
  "logout",
  "signup",
  "register",
  "regisztracio",
  "auth",
  "account",
  "fiok",
  "oauth",
  "sso",
  // infrastructure and services
  "mail",
  "smtp",
  "imap",
  "pop",
  "mx",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "ftp",
  "ssh",
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "storage",
  "status",
  "webhook",
  "webhooks",
  "autodiscover",
  // product and business
  "billing",
  "fizetes",
  "payment",
  "console",
  "dashboard",
  "help",
  "support",
  "segitseg",
  "docs",
  "blog",
  "news",
  "root",
  "system",
  "null",
  "undefined",
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;

export type SlugCheck =
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly reason: "invalid" | "reserved" };

/**
 * Normalizes `input` with `slugify()` (no diacritics, lower case, single hyphens) and checks length
 * and the reserved words. `invalid`: nothing usable is left or the length is out of range.
 */
export function checkSlug(input: string): SlugCheck {
  const slug = slugify(input);
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, reason: "reserved" };
  return { ok: true, slug };
}

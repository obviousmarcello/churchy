/**
 * Registrable-domain comparison for "same site" crawling, without a public-suffix library:
 * the last two labels, or three under a known second-level public suffix. Hosts of shared
 * hosting platforms (every customer is a subdomain) are their own suffix, so two unrelated
 * churches on `*.blogspot.com` are never "the same site". Conservative on unknown suffixes
 * (an unlisted suffix makes a site look bigger, never reaches another registrant's domain
 * except under an unlisted second-level suffix; extend the lists when one shows up).
 */

const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.hu",
  "org.hu",
  "co.hu",
  "gov.hu",
  "info.hu",
  "net.hu",
  "edu.hu",
  "hu.com",
  "com.ro",
  "org.ro",
  "com.sk",
  "org.sk",
  "co.at",
  "or.at",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "co.za",
  "co.jp",
  "com.pl",
  "org.pl",
]);

const SHARED_HOSTING = new Set([
  "blogspot.com",
  "wixsite.com",
  "wordpress.com",
  "weebly.com",
  "webnode.hu",
  "webnode.com",
  "github.io",
  "gitlab.io",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
  "herokuapp.com",
  "azurewebsites.net",
  "sites.google.com",
  "tumblr.com",
  "jimdofree.com",
  "jimdosite.com",
  "strikingly.com",
  "squarespace.com",
  "godaddysites.com",
  "fw.hu",
  "5mp.eu",
]);

/** `www.templom.example.hu` → `example.hu`; null for IP literals and bare suffixes. */
export function registrableDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (/^[\d.]+$/.test(h) || h.includes(":")) return null;
  const labels = h.split(".");
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join(".");
  if (SHARED_HOSTING.has(last2)) return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  if (labels.length >= 3 && SHARED_HOSTING.has(labels.slice(-3).join("."))) {
    return labels.length >= 4 ? labels.slice(-4).join(".") : null;
  }
  if (SECOND_LEVEL.has(last2)) return labels.length >= 3 ? labels.slice(-3).join(".") : null;
  return last2;
}

/** Same registrable domain (www and any subdomain of it count as the same site). */
export function sameSite(a: string, b: string): boolean {
  const ra = registrableDomain(a);
  const rb = registrableDomain(b);
  return ra !== null && ra === rb;
}

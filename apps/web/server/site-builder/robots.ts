/**
 * robots.txt (RFC 9309) for the site builder. The crawler's product token is `ChurchySiteBuilder`;
 * a group for it wins over `*`; the longest matching rule wins, `Allow` wins a tie.
 */

export const ROBOTS_PRODUCT_TOKEN = "ChurchySiteBuilder";
/** RFC 9309 asks parsers to read at least 500 KiB. */
export const ROBOTS_MAX_BYTES = 512 * 1024;

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
  readonly regex: RegExp;
}

export interface Robots {
  /** Whether the crawler may fetch this path (pathname + search). */
  isAllowed(pathAndQuery: string): boolean;
  /** `Crawl-delay` in seconds of the matching group, when given. */
  readonly crawlDelaySeconds: number | null;
  readonly sitemaps: readonly string[];
}

export const ALLOW_ALL: Robots = { isAllowed: () => true, crawlDelaySeconds: null, sitemaps: [] };
export const DISALLOW_ALL: Robots = {
  isAllowed: () => false,
  crawlDelaySeconds: null,
  sitemaps: [],
};

function toRegex(pattern: string): RegExp {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") source += ".*";
    else if (ch === "$") source += "$";
    else source += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  // A `$` in the middle of a pattern is literal in practice; only a trailing one anchors.
  const anchored = pattern.endsWith("$");
  const body = anchored
    ? source.slice(0, -1).replaceAll("$", "\\$") + "$"
    : source.replaceAll("$", "\\$");
  return new RegExp("^" + body);
}

/** Percent-encodings compare case-insensitively; everything else byte-for-byte. */
function normalize(path: string): string {
  return path.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

export function parseRobots(text: string, token: string = ROBOTS_PRODUCT_TOKEN): Robots {
  const wanted = token.toLowerCase();
  interface Group {
    agents: string[];
    rules: Rule[];
    delay: number | null;
  }
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let collecting = false; // still reading the user-agent lines of the current group
  for (const raw of text.slice(0, ROBOTS_MAX_BYTES).split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!collecting || !current) {
        current = { agents: [], rules: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collecting = true;
    } else if (field === "sitemap") {
      if (value) sitemaps.push(value);
    } else if (field === "allow" || field === "disallow") {
      collecting = false;
      if (!current) continue;
      if (value === "") continue; // empty Disallow allows everything; empty Allow is a no-op
      current.rules.push({
        allow: field === "allow",
        pattern: value,
        regex: toRegex(normalize(value)),
      });
    } else if (field === "crawl-delay") {
      collecting = false;
      const n = Number(value);
      if (current && Number.isFinite(n) && n >= 0) current.delay = n;
    } else {
      collecting = false;
    }
  }
  // The most specific matching product token; `*` only when none matches.
  let best = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a !== "*" && wanted.includes(a) && a.length > best) best = a.length;
    }
  }
  const applies = (g: Group) =>
    best >= 0
      ? g.agents.some((a) => a !== "*" && wanted.includes(a) && a.length === best)
      : g.agents.includes("*");
  const selected = groups.filter(applies);
  const rules = selected.flatMap((g) => g.rules);
  const delays = selected.map((g) => g.delay).filter((d): d is number => d !== null);
  return {
    sitemaps,
    crawlDelaySeconds: delays.length ? Math.max(...delays) : null,
    isAllowed(pathAndQuery: string): boolean {
      const path = normalize(pathAndQuery || "/");
      let verdict: { allow: boolean; length: number } | null = null;
      for (const r of rules) {
        if (!r.regex.test(path)) continue;
        const length = r.pattern.length;
        if (!verdict || length > verdict.length || (length === verdict.length && r.allow)) {
          verdict = { allow: r.allow, length };
        }
      }
      return verdict ? verdict.allow : true;
    },
  };
}

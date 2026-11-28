import { BlockList, isIP } from "node:net";

/**
 * SSRF guard of the site builder fetcher (SDD ADR "site builder"): decides whether a URL and an
 * address may be contacted. Pure and synchronous; the DNS part lives in `fetcher.ts` (it validates
 * the very addresses the socket connects to, so a rebinding DNS answer cannot slip in between).
 */

export type BlockReason = "scheme" | "credentials" | "port" | "hostname" | "address" | "malformed";

const v4 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  v4.addSubnet(net, prefix, "ipv4");
}

const v6 = new BlockList();
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback, IPv4-compatible
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
] as const) {
  v6.addSubnet(net, prefix, "ipv6");
}

/** The 16 bytes of an IPv6 text address, or null. Handles `::` and an embedded dotted IPv4 tail. */
export function parseIPv6(input: string): number[] | null {
  let text = input;
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (isIP(text) !== 6) return null;
  const tail = text.lastIndexOf(":");
  const dotted = text.slice(tail + 1);
  let tailWords: number[] = [];
  if (dotted.includes(".")) {
    const parts = dotted.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    tailWords = [(parts[0]! << 8) | parts[1]!, (parts[2]! << 8) | parts[3]!];
    text = text.slice(0, tail + 1) + "0:0";
  }
  const [head, rest] = text.split("::");
  const toWords = (s: string | undefined) =>
    s === undefined || s === "" ? [] : s.split(":").map((w) => parseInt(w, 16));
  const headWords = toWords(head);
  const restWords = text.includes("::") ? toWords(rest) : [];
  const words = text.includes("::")
    ? [
        ...headWords,
        ...Array<number>(8 - headWords.length - restWords.length).fill(0),
        ...restWords,
      ]
    : headWords;
  if (words.length !== 8 || words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff)) return null;
  if (tailWords.length === 2) {
    words[6] = tailWords[0]!;
    words[7] = tailWords[1]!;
  }
  return words.flatMap((w) => [w >> 8, w & 0xff]);
}

function dotted(b: readonly number[]): string {
  return b.join(".");
}

/** Whether an IP literal is publicly routable. `allowLoopback` is the tests' door (see fetcher). */
export function isPublicAddress(address: string, opts: { allowLoopback?: boolean } = {}): boolean {
  const family = isIP(address);
  if (family === 4) {
    if (opts.allowLoopback && v4.check(address, "ipv4") && address.startsWith("127.")) return true;
    return !v4.check(address, "ipv4");
  }
  if (family === 6) {
    const bytes = parseIPv6(address);
    if (!bytes) return false;
    const allZeroTo = (n: number) => bytes.slice(0, n).every((b) => b === 0);
    if (opts.allowLoopback && allZeroTo(15) && bytes[15] === 1) return true;
    // IPv4-mapped ::ffff:a.b.c.d
    if (allZeroTo(10) && bytes[10] === 0xff && bytes[11] === 0xff) {
      return isPublicAddress(dotted(bytes.slice(12)), opts);
    }
    // NAT64 64:ff9b::/96 embeds the IPv4 address
    if (
      bytes[0] === 0x00 &&
      bytes[1] === 0x64 &&
      bytes[2] === 0xff &&
      bytes[3] === 0x9b &&
      bytes.slice(4, 12).every((b) => b === 0)
    ) {
      return isPublicAddress(dotted(bytes.slice(12)), opts);
    }
    // 6to4 2002:AABB:CCDD::/48 embeds the IPv4 address
    if (bytes[0] === 0x20 && bytes[1] === 0x02) {
      return isPublicAddress(dotted(bytes.slice(2, 6)), opts);
    }
    return !v6.check(address, "ipv6");
  }
  return false;
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".test",
  ".invalid",
  ".example",
  ".arpa",
];

export interface UrlPolicy {
  /** Ports other than 80/443 (tests only). */
  readonly extraPorts?: readonly number[];
  /** Loopback is allowed (tests only). */
  readonly allowLoopback?: boolean;
}

export type UrlCheck =
  | { readonly ok: true; readonly url: URL; readonly host: string }
  | { readonly ok: false; readonly reason: BlockReason };

/** Syntactic checks on a URL before any DNS or network: scheme, credentials, port, hostname. */
export function checkUrl(input: string | URL, policy: UrlPolicy = {}): UrlCheck {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : new URL(input.href);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port === "" ? defaultPort : Number(url.port);
  if (port !== 80 && port !== 443 && !policy.extraPorts?.includes(port)) {
    return { ok: false, reason: "port" };
  }
  // The WHATWG parser already normalised exotic IPv4 forms (2130706433, 0x7f.1, 127.1) to dotted quads.
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host === "") return { ok: false, reason: "hostname" };
  if (isIP(host)) {
    return isPublicAddress(host, policy)
      ? { ok: true, url, host }
      : { ok: false, reason: "address" };
  }
  const loopbackName =
    policy.allowLoopback && (host === "localhost" || host.endsWith(".localhost"));
  if (!loopbackName) {
    if (!host.includes(".") || host === "localhost") return { ok: false, reason: "hostname" };
    if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: "hostname" };
  }
  return { ok: true, url, host };
}

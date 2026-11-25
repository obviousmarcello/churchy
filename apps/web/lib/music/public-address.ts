import { isIP } from "node:net";

// Is an IP address on the public internet? The server reads addresses that a
// user sets (e.g. the ICS address of an announcements calendar): it must not
// reach the internal network of the server, e.g. 127.0.0.1, 10.0.0.1 or the
// metadata service of the cloud at 169.254.169.254.

/** The IPv4 ranges that are not public: [first address, prefix length]. */
const PRIVATE_IPV4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // "this network", with the unspecified address
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, with the cloud metadata service
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarks
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, with the broadcast address 255.255.255.255
];

/** The address as a number, or null when it is not a dotted IPv4 address. */
function ipv4Number(address: string): number | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

const PRIVATE_IPV4_RANGES = PRIVATE_IPV4.map(([first, prefix]) => ({
  first: ipv4Number(first) ?? 0,
  size: 2 ** (32 - prefix),
}));

function isPublicIpv4(value: number): boolean {
  return !PRIVATE_IPV4_RANGES.some(({ first, size }) => value >= first && value < first + size);
}

/** The 8 groups of 16 bits of an IPv6 address (without a zone, e.g. "%eth0"), or null. */
type Groups = [number, number, number, number, number, number, number, number];

function ipv6Groups(address: string): Groups | null {
  if (isIP(address) !== 6) return null;
  let text = address.replace(/%.*$/, "");
  // A last part in IPv4 form, e.g. "::ffff:127.0.0.1": two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (dotted) {
    const value = ipv4Number(dotted[1]!);
    if (value === null) return null;
    text = `${text.slice(0, dotted.index)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const parse = (part: string | undefined) =>
    part ? part.split(":").map((group) => parseInt(group, 16)) : [];
  const first = parse(head);
  const last = parse(tail);
  const groups =
    tail === undefined
      ? first
      : [...first, ...Array<number>(8 - first.length - last.length).fill(0), ...last];
  return groups.length === 8 &&
    groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? (groups as Groups)
    : null;
}

/** The IPv4 address in two groups of an IPv6 address. */
function embeddedIpv4(high: number, low: number): number {
  return high * 0x10000 + low;
}

function isPublicIpv6(g: Groups): boolean {
  const zeros = (count: number) => g.slice(0, count).every((group) => group === 0);
  // ::/96: the unspecified address ::, the loopback ::1 and the old IPv4-compatible addresses.
  if (zeros(6)) return false;
  // ::ffff:0:0/96: an IPv4 address in IPv6 form, e.g. ::ffff:127.0.0.1.
  if (zeros(5) && g[5] === 0xffff) return isPublicIpv4(embeddedIpv4(g[6], g[7]));
  // ::ffff:0:0:0/96: SIIT, an IPv4-translated address, which reaches the IPv4 address.
  if (zeros(4) && g[4] === 0xffff && g[5] === 0) return isPublicIpv4(embeddedIpv4(g[6], g[7]));
  // 64:ff9b::/96: NAT64, which reaches the IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0)
    return isPublicIpv4(embeddedIpv4(g[6], g[7]));
  // 64:ff9b:1::/48: local NAT64. The IPv4 address can be at another place, so none of these is public.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false;
  // 2002::/16: 6to4, which reaches the IPv4 address of the groups 2 and 3.
  if (g[0] === 0x2002) return isPublicIpv4(embeddedIpv4(g[1], g[2]));
  // 2001::/32: Teredo, which hides an IPv4 address. 2001:db8::/32: documentation.
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false;
  // 100::/64: discard.
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false;
  // fc00::/7: unique local. fe80::/10: link-local. fec0::/10: the old site-local. ff00::/8: multicast.
  if (
    (g[0] & 0xfe00) === 0xfc00 ||
    (g[0] & 0xffc0) === 0xfe80 ||
    (g[0] & 0xffc0) === 0xfec0 ||
    (g[0] & 0xff00) === 0xff00
  )
    return false;
  return true;
}

/**
 * True when the IP address is public: false for a loopback, private,
 * link-local, unique-local, carrier-grade NAT, unspecified, multicast,
 * broadcast or reserved address, also in an IPv6 form of an IPv4 address
 * (e.g. ::ffff:10.0.0.1). An IPv6 address can be in brackets, as in a URL.
 * False for a text that is not an IP address, e.g. a host name.
 */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[(.*)\]$/, "$1");
  const ipv4 = ipv4Number(bare);
  if (ipv4 !== null) return isPublicIpv4(ipv4);
  const ipv6 = ipv6Groups(bare);
  return ipv6 !== null && isPublicIpv6(ipv6);
}

/** The IP address of a host of a URL (without the brackets of IPv6), or null for a host name. */
export function ipLiteral(hostname: string): string | null {
  const bare = hostname.replace(/^\[(.*)\]$/, "$1");
  return isIP(bare) ? bare : null;
}

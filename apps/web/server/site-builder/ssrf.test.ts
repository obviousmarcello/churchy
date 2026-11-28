// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkUrl, isPublicAddress, parseIPv6 } from "./ssrf";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "127.9.9.9",
    "10.0.0.1",
    "172.16.5.4",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:1::1",
    "2002:0a00:0001::",
    "::127.0.0.1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "93.184.216.34",
    "1.1.1.1",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "2002:0808:0808::1",
  ])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("allows loopback only with the fixture switch, and nothing else private", () => {
    expect(isPublicAddress("127.0.0.1", { allowLoopback: true })).toBe(true);
    expect(isPublicAddress("::1", { allowLoopback: true })).toBe(true);
    expect(isPublicAddress("10.0.0.1", { allowLoopback: true })).toBe(false);
    expect(isPublicAddress("169.254.169.254", { allowLoopback: true })).toBe(false);
  });

  it("parses IPv6 forms", () => {
    expect(parseIPv6("::1")).toEqual([...Array(15).fill(0), 1]);
    expect(parseIPv6("::ffff:1.2.3.4")?.slice(10)).toEqual([0xff, 0xff, 1, 2, 3, 4]);
    expect(parseIPv6("fe80::1%eth0")?.[0]).toBe(0xfe);
    expect(parseIPv6("nope")).toBeNull();
  });
});

describe("checkUrl", () => {
  it("accepts public http(s) on 80/443", () => {
    expect(checkUrl("https://templom.example.hu/miserend").ok).toBe(true);
    expect(checkUrl("http://templom.example.hu:80/").ok).toBe(true);
    expect(checkUrl("https://templom.example.hu:443/").ok).toBe(true);
  });

  it.each([
    ["ftp://example.hu/", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["gopher://example.hu/", "scheme"],
    ["https://user:pw@example.hu/", "credentials"],
    ["https://example.hu:8443/", "port"],
    ["http://example.hu:22/", "port"],
    ["http://localhost/", "hostname"],
    ["http://app.localhost/", "hostname"],
    ["http://intranet/", "hostname"],
    ["http://printer.local/", "hostname"],
    ["http://metadata.google.internal/", "hostname"],
    ["http://127.0.0.1/", "address"],
    ["http://2130706433/", "address"],
    ["http://0x7f.1/", "address"],
    ["http://127.1/", "address"],
    ["http://0177.0.0.1/", "address"],
    ["http://169.254.169.254/latest/meta-data/", "address"],
    ["http://[::1]/", "address"],
    ["http://[::ffff:127.0.0.1]/", "address"],
    ["http://[fd00::1]/", "address"],
    ["http://10.1.2.3/", "address"],
    ["not a url", "malformed"],
  ])("blocks %s (%s)", (url, reason) => {
    const res = checkUrl(url);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe(reason);
  });

  it("normalises a trailing dot", () => {
    expect(checkUrl("http://localhost./").ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { ipLiteral, isPublicAddress } from "./public-address";

describe("isPublicAddress", () => {
  it("accepts public IPv4 addresses", () => {
    for (const address of [
      "1.1.1.1",
      "8.8.8.8",
      "93.184.216.34",
      "9.255.255.255",
      "11.0.0.0",
      "100.63.255.255",
      "100.128.0.0",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    for (const address of [
      "126.255.255.255",
      "128.0.0.0",
      "169.253.255.255",
      "169.255.0.0",
      "172.15.255.255",
      "172.32.0.0",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    for (const address of ["192.167.255.255", "192.169.0.0", "223.255.255.255"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("refuses each IPv4 range that is not public, at its first and last address", () => {
    const ranges: [string, string][] = [
      ["0.0.0.0", "0.255.255.255"], // unspecified, "this network"
      ["10.0.0.0", "10.255.255.255"], // private
      ["100.64.0.0", "100.127.255.255"], // carrier-grade NAT
      ["127.0.0.0", "127.255.255.255"], // loopback
      ["169.254.0.0", "169.254.255.255"], // link-local
      ["172.16.0.0", "172.31.255.255"], // private
      ["192.168.0.0", "192.168.255.255"], // private
      ["224.0.0.0", "239.255.255.255"], // multicast
      ["240.0.0.0", "255.255.255.255"], // reserved, broadcast
      ["192.0.0.0", "192.0.0.255"],
      ["192.0.2.0", "192.0.2.255"],
      ["198.18.0.0", "198.19.255.255"],
      ["198.51.100.0", "198.51.100.255"],
      ["203.0.113.0", "203.0.113.255"],
    ];
    for (const [first, last] of ranges) {
      expect(isPublicAddress(first), first).toBe(false);
      expect(isPublicAddress(last), last).toBe(false);
    }
    expect(isPublicAddress("127.0.0.1")).toBe(false);
    expect(isPublicAddress("169.254.169.254")).toBe(false);
  });

  it("accepts public IPv6 addresses", () => {
    for (const address of [
      "2606:4700:4700::1111",
      "2a00:1450:4001:82a::200e",
      "[2001:4860:4860::8888]",
      "fbff::1",
      "fe7f::1",
      "2001:1::1",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("refuses the IPv6 ranges that are not public", () => {
    const addresses = [
      "::", // unspecified
      "::1", // loopback
      "0:0:0:0:0:0:0:1",
      "[::1]",
      "fe80::1", // link-local
      "fe80::1%lo0",
      "febf:ffff::1",
      "fc00::1", // unique local
      "fd12:3456::1",
      "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "fec0::1", // old site-local
      "ff02::1", // multicast
      "2001:db8::1", // documentation
      "2001:0:4136:e378::1", // Teredo
      "100::1", // discard
      "::a00:1", // IPv4-compatible
    ];
    for (const address of addresses) expect(isPublicAddress(address), address).toBe(false);
  });

  it("checks the IPv4 address in an IPv6 form", () => {
    for (const address of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "[::ffff:10.0.0.1]",
      "::ffff:169.254.169.254",
      "::ffff:192.168.1.1",
      "::ffff:100.64.0.1",
      "::ffff:0.0.0.0",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of [
      "64:ff9b::10.0.0.1",
      "64:ff9b::7f00:1",
      "2002:a00:1::1",
      "2002:c0a8:101::1",
      // SIIT and local NAT64.
      "::ffff:0:7f00:1",
      "::ffff:0:10.0.0.1",
      "64:ff9b:1::a00:1",
      "64:ff9b:1::8.8.8.8",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of [
      "::ffff:8.8.8.8",
      "::ffff:808:808",
      "64:ff9b::8.8.8.8",
      "2002:808:808::1",
      "::ffff:0:808:808",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it("refuses a text that is not an IP address", () => {
    for (const text of [
      "",
      "localhost",
      "example.com",
      "1.2.3",
      "01.2.3.4",
      "256.0.0.1",
      "::ffff:999.0.0.1",
      "[1.2.3.4]x",
      "gggg::1",
    ]) {
      expect(isPublicAddress(text), text).toBe(false);
    }
  });
});

describe("ipLiteral", () => {
  it("gives the IP address of a URL host, without the brackets", () => {
    expect(ipLiteral("127.0.0.1")).toBe("127.0.0.1");
    expect(ipLiteral("[::1]")).toBe("::1");
    expect(ipLiteral("[::ffff:7f00:1]")).toBe("::ffff:7f00:1");
    expect(ipLiteral(new URL("https://2130706433/").hostname)).toBe("127.0.0.1");
  });

  it("gives null for a host name", () => {
    expect(ipLiteral("calendar.google.com")).toBeNull();
    expect(ipLiteral("localhost")).toBeNull();
  });
});

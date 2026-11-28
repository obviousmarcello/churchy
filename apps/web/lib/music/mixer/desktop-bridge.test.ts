import { describe, expect, it } from "vitest";

import {
  broadcastAddress,
  deskOfXinfo,
  isFxParam,
  isFxSlot,
  isPrivateIpv4,
} from "./desktop-bridge";

describe("isPrivateIpv4", () => {
  it("accepts the addresses of a local network", () => {
    for (const host of [
      "10.0.0.5",
      "172.16.1.1",
      "172.31.255.254",
      "192.168.1.50",
      "169.254.10.2",
    ]) {
      expect(isPrivateIpv4(host)).toBe(true);
    }
  });

  it("rejects public addresses, host names and invalid addresses", () => {
    for (const host of [
      "8.8.8.8",
      "172.32.0.1",
      "192.169.0.1",
      "127.0.0.1",
      "mixer.local",
      "192.168.1.256",
      "192.168.1",
      "",
    ]) {
      expect(isPrivateIpv4(host)).toBe(false);
    }
  });

  it("rejects leading zeros, which a socket can read as octal", () => {
    for (const host of ["010.8.8.8", "192.168.01.50", "10.0.0.05"]) {
      expect(isPrivateIpv4(host)).toBe(false);
    }
    expect(isPrivateIpv4("10.0.0.0")).toBe(true);
  });
});

describe("the checks of the bridge", () => {
  it("accepts only the slots and the parameters of the desk", () => {
    expect(isFxSlot(1) && isFxSlot(8)).toBe(true);
    expect(isFxSlot(0) || isFxSlot(9) || isFxSlot(1.5) || isFxSlot("1")).toBe(false);
    expect(isFxParam(1) && isFxParam(64)).toBe(true);
    expect(isFxParam(65) || isFxParam(0)).toBe(false);
  });
});

describe("the search for the desks", () => {
  it("sends to the broadcast address of each network", () => {
    expect(broadcastAddress("192.168.1.20", "255.255.255.0")).toBe("192.168.1.255");
    expect(broadcastAddress("10.1.2.3", "255.255.0.0")).toBe("10.1.255.255");
    expect(broadcastAddress("172.16.5.9", "255.255.252.0")).toBe("172.16.7.255");
  });

  it("reads the answer of a desk, with the address that it came from", () => {
    const args = ["192.168.1.50", "FOH", "X32", "4.06"].map((value) => ({
      type: "s" as const,
      value,
    }));
    expect(deskOfXinfo({ address: "/xinfo", args }, "192.168.1.50")).toEqual({
      host: "192.168.1.50",
      name: "FOH",
      model: "X32",
      version: "4.06",
    });
    expect(deskOfXinfo({ address: "/xinfo", args: [] }, "10.0.0.2")).toEqual({
      host: "10.0.0.2",
      name: "",
      model: "",
      version: "",
    });
  });

  it("ignores other messages and public addresses", () => {
    expect(deskOfXinfo({ address: "/info", args: [] }, "192.168.1.50")).toBeNull();
    expect(deskOfXinfo({ address: "/xinfo", args: [] }, "8.8.8.8")).toBeNull();
  });
});

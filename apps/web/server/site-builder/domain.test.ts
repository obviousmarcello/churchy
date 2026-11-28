// @vitest-environment node
import { describe, expect, it } from "vitest";
import { registrableDomain, sameSite } from "./domain";

describe("registrableDomain", () => {
  it.each([
    ["www.templom.hu", "templom.hu"],
    ["a.b.templom.hu", "templom.hu"],
    ["parokia.com.hu", "parokia.com.hu"],
    ["www.parokia.com.hu", "parokia.com.hu"],
    ["mycs.blogspot.com", "mycs.blogspot.com"],
    ["www.mycs.blogspot.com", "mycs.blogspot.com"],
    ["x.github.io", "x.github.io"],
    ["templom.hu.", "templom.hu"],
  ])("%s -> %s", (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });

  it("is null for IPs and bare suffixes", () => {
    expect(registrableDomain("1.2.3.4")).toBeNull();
    expect(registrableDomain("localhost")).toBeNull();
    expect(registrableDomain("blogspot.com")).toBeNull();
    expect(registrableDomain("com.hu")).toBeNull();
  });

  it("keeps unrelated customers of shared hosting apart", () => {
    expect(sameSite("a.blogspot.com", "b.blogspot.com")).toBe(false);
    expect(sameSite("www.templom.hu", "hirek.templom.hu")).toBe(true);
    expect(sameSite("templom.hu", "templom.com")).toBe(false);
  });
});

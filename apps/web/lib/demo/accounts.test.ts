import { describe, expect, it } from "vitest";
import { DEMO_ACCOUNTS, demoAccountByEmail, looksLikeEmail } from "./accounts";
import { DEMO_PERSONA_KEYS } from "./personas";

describe("demo accounts", () => {
  it("has one fictitious account for every persona except the visitor and the platform operator (switcher only)", () => {
    const personas = DEMO_ACCOUNTS.map((a) => a.persona).sort();
    expect(personas).toEqual(
      DEMO_PERSONA_KEYS.filter((k) => k !== "latogato" && k !== "uzemelteto").sort(),
    );
  });

  it("uses unique example-domain addresses", () => {
    const emails = DEMO_ACCOUNTS.map((a) => a.email);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) expect(email).toMatch(/^[a-z.]+@pelda\.hu$/);
  });

  it("finds an account regardless of case and surrounding spaces", () => {
    expect(demoAccountByEmail("  Lajos.Tulajdonos@pelda.hu ")?.persona).toBe("tulajdonos");
    expect(demoAccountByEmail("nobody@pelda.hu")).toBeNull();
  });

  it("sends diocesan accounts to the portal and owners to the admin", () => {
    expect(demoAccountByEmail("dora.egyhazmegyei@pelda.hu")?.home).toBe("diocese");
    expect(demoAccountByEmail("lajos.tulajdonos@pelda.hu")?.home).toBe("admin");
    expect(demoAccountByEmail("peter.onkentes@pelda.hu")?.home).toBe("workspace");
  });
});

describe("looksLikeEmail", () => {
  it("accepts plausible and rejects broken addresses", () => {
    expect(looksLikeEmail("nev@pelda.hu")).toBe(true);
    expect(looksLikeEmail("nev@pelda")).toBe(false);
    expect(looksLikeEmail("nev pelda.hu")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

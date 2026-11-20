import { expect, it } from "vitest";
import type { ContactMessageInput } from "../../modules/contact";
import { ContactReferenceSchema } from "../../modules/contact";
import { defineContractSuite, expectContractError } from "../harness";

function sample(overrides: Partial<ContactMessageInput> = {}): ContactMessageInput {
  return {
    name: "Minta Mária",
    email: "minta.maria@example.test",
    phone: "",
    subject: "Érdeklődés",
    message: "Szeretnék érdeklődni a hittanórák időpontjáról.",
    consent: true,
    ...overrides,
  };
}

export const contactContract = defineContractSuite("contact", (t) => {
  it("accepts a message from an anonymous visitor and returns a reference number", async () => {
    const first = await t.repo.submit(t.ctx.anonA, sample());
    expect(ContactReferenceSchema.safeParse(first.reference).success).toBe(true);
    const second = await t.repo.submit(t.ctx.anonA, sample({ phone: "+36 30 123 4567" }));
    expect(second.reference).not.toBe(first.reference);
    // Staff of a church may use the form too.
    expect((await t.repo.submit(t.ctx.a, sample())).reference).toMatch(/^KAP-/);
  });

  it("rejects invalid input", async () => {
    for (const bad of [
      sample({ name: " " }),
      sample({ email: "nem-email" }),
      sample({ phone: "abc" }),
      sample({ subject: "" }),
      sample({ message: "rövid" }),
      sample({ message: "x".repeat(3001) }),
      sample({ consent: false as never }),
    ]) {
      await expectContractError(t.repo.submit(t.ctx.anonA, bad), "VALIDATION");
    }
  });

  it("needs a church (tenant) context", async () => {
    await expectContractError(t.repo.submit(t.ctx.org, sample()), "CONTEXT");
    await expectContractError(t.repo.submit(t.ctx.platform, sample()), "CONTEXT");
  });
});

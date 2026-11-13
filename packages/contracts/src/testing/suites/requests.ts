import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { RequestRepo } from "../../modules/requests";
import { FUTURE, defineContractSuite, expectContractError, ids, uniq } from "../harness";

async function baptismForm(repo: RequestRepo, ctx: Ctx) {
  return repo.upsertForm(ctx, {
    key: uniq("keresztelo"),
    title: "Keresztelési bejelentés",
    referencePrefix: "KER",
    fields: [
      { type: "text", key: "gyermekNeve", label: "A gyermek neve", required: true },
      { type: "date", key: "szuletesiDatum", label: "Születési dátum", required: false },
      { type: "email", key: "email", label: "E-mail", required: true },
    ],
    notifyEmails: ["iroda@example.test"],
  });
}

const submission = (formKey: string) => ({
  formKey,
  data: { gyermekNeve: "Minta Bence", szuletesiDatum: "2026-09-01", email: "szulo@example.test" },
  consent: true as const,
  consentTextHash: "sha256-adatkezeles-v1",
});

export const requestsContract = defineContractSuite("requests", (t) => {
  it("accepts anonymous submissions and lists them in the inbox", async () => {
    const form = await baptismForm(t.repo, t.ctx.a);
    expect(form).toMatchObject({ retentionDays: 365, active: true, confirmationText: "" });
    expect((await t.repo.listForms(t.ctx.anonA)).map((f) => f.key)).toContain(form.key);
    const receipt = await t.repo.submit(t.ctx.anonA, submission(form.key));
    expect(receipt.reference).toMatch(/^KER-\d{4}-\d{4,}$/);
    expect(Object.keys(receipt).sort()).toEqual(["id", "reference"]);

    const inbox = await t.repo.list(t.ctx.a, { status: "uj", formKey: form.key });
    expect(ids(inbox)).toContain(receipt.id);
    const stored = await t.repo.get(t.ctx.a, receipt.id);
    expect(stored).toMatchObject({
      status: "uj",
      closedAt: null,
      purgeAfter: null,
      assigneeUserId: null,
    });
    expect(stored?.data.gyermekNeve).toBe("Minta Bence");

    await t.repo.assign(t.ctx.a, receipt.id, t.env.actorA.userId);
    const noted = await t.repo.addNote(t.ctx.a, receipt.id, "Visszahívtuk, egyeztettünk.");
    expect(noted.notes.map((n) => n.body)).toEqual(["Visszahívtuk, egyeztettünk."]);
    const closed = await t.repo.setStatus(t.ctx.a, receipt.id, "lezart");
    expect(closed.closedAt).not.toBeNull();
    // closedAt + retentionDays (± 1 h tolerance for adapters that add calendar days across DST).
    const retention = Date.parse(closed.purgeAfter!) - Date.parse(closed.closedAt!);
    expect(Math.abs(retention - 365 * 86_400_000)).toBeLessThanOrEqual(3_600_000);
    expect(await t.repo.purgeExpired(t.ctx.a, FUTURE)).toBeGreaterThanOrEqual(1);
    expect(await t.repo.get(t.ctx.a, receipt.id)).toBeNull();
  });

  it("never lets anonymous visitors read requests", async () => {
    const form = await baptismForm(t.repo, t.ctx.a);
    const receipt = await t.repo.submit(t.ctx.anonA, submission(form.key));
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    expect(await t.repo.get(t.ctx.anonA, receipt.id)).toBeNull();
  });

  it("validates submissions against the form definition", async () => {
    const form = await baptismForm(t.repo, t.ctx.a);
    const bad = submission(form.key);
    await expectContractError(
      t.repo.submit(t.ctx.anonA, { ...bad, data: { email: "szulo@example.test" } }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.submit(t.ctx.anonA, { ...bad, data: { ...bad.data, email: "nem-email" } }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.submit(t.ctx.anonA, { ...bad, data: { ...bad.data, ismeretlen: "x" } }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.submit(t.ctx.anonA, { ...bad, consent: false as never }),
      "VALIDATION",
    );
    await expectContractError(t.repo.submit(t.ctx.anonA, submission("nincs-ilyen")), "NOT_FOUND");
    await expectContractError(
      t.repo.upsertForm(t.ctx.a, {
        key: "Rossz Kulcs",
        title: "X",
        referencePrefix: "KER",
        fields: [],
      }),
      "VALIDATION",
    );
  });

  it("never returns or modifies tenant A's requests for tenant B", async () => {
    const form = await baptismForm(t.repo, t.ctx.a);
    const receipt = await t.repo.submit(t.ctx.anonA, submission(form.key));
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(receipt.id);
    expect(await t.repo.get(t.ctx.b, receipt.id)).toBeNull();
    expect(await t.repo.getForm(t.ctx.anonB, form.key)).toBeNull();
    expect(await t.repo.list(t.ctx.org)).toEqual([]);
    await expectContractError(t.repo.submit(t.ctx.anonB, submission(form.key)), "NOT_FOUND");
    await expectContractError(t.repo.setStatus(t.ctx.b, receipt.id, "lezart"), "NOT_FOUND");
    await expectContractError(t.repo.addNote(t.ctx.b, receipt.id, "Idegen"), "NOT_FOUND");
    await expectContractError(t.repo.deleteForm(t.ctx.b, form.id), "NOT_FOUND");
    await expectContractError(t.repo.deleteForm(t.ctx.a, form.id), "CONFLICT");
  });
});

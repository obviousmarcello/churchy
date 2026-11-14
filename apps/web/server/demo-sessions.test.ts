import { describe, expect, it } from "vitest";
import { ANONYMOUS_ACTOR, type Ctx } from "@churchy/contracts";
import { demoDirectory, listOutbox, repositoriesFor, resetDemoSession } from "./data-adapters";

const tenantId = demoDirectory().defaultTenantId;
const staff: Ctx = { tenantId, actor: { userId: "dev-user", personId: null } };

async function submit(sessionId: string | null) {
  const { requests } = repositoriesFor(sessionId);
  if ((await requests.getForm(staff, "teszt-d92")) === null) {
    await requests.upsertForm(staff, {
      key: "teszt-d92",
      title: "Teszt",
      referencePrefix: "KER",
      fields: [{ type: "textarea", key: "note", label: "Kérelem", required: true }],
    });
  }
  return requests.submit(
    { tenantId, actor: ANONYMOUS_ACTOR },
    {
      formKey: "teszt-d92",
      data: { note: "x" },
      consent: true,
      consentTextHash: "teszt-hozzajarulas",
    },
  );
}

describe("demo sessions (D-91 AC1, D-92)", () => {
  it("isolates the data of two demo visitors", async () => {
    const a = `sess-a-${crypto.randomUUID()}`;
    const b = `sess-b-${crypto.randomUUID()}`;
    await submit(a);
    expect(listOutbox(a)).toHaveLength(2);
    expect(listOutbox(b)).toHaveLength(0);
    expect(await repositoriesFor(b).requests.getForm(staff, "teszt-d92")).toBeNull();
  });

  it("Visszaállítás restores the seed: data, outbox and reference numbering", async () => {
    const id = `sess-r-${crypto.randomUUID()}`;
    const first = await submit(id);
    const second = await submit(id);
    expect(second.reference).not.toBe(first.reference);
    expect(listOutbox(id)).toHaveLength(4);

    resetDemoSession(id);

    expect(listOutbox(id)).toEqual([]);
    expect(await repositoriesFor(id).requests.getForm(staff, "teszt-d92")).toBeNull();
    expect((await submit(id)).reference).toBe(first.reference);
  });
});

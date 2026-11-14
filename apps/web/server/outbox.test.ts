import { beforeEach, describe, expect, it } from "vitest";
import { ANONYMOUS_ACTOR, getRepositories, type Ctx } from "@churchy/contracts";
import { EMAIL_TEMPLATE_KEYS, renderEmail, renderPush } from "@churchy/email";
import { clearOutbox, listOutbox } from "./data-adapters";
import { emailContextFor } from "./email-context";

const tenantId = "demo-tenant";
const staff: Ctx = { tenantId, actor: { userId: "dev-user", personId: null } };
const visitor: Ctx = { tenantId, actor: ANONYMOUS_ACTOR };

async function submitRequest() {
  const { requests } = getRepositories();
  if ((await requests.getForm(staff, "teszt")) === null) {
    await requests.upsertForm(staff, {
      key: "teszt",
      title: "Teszt",
      referencePrefix: "KER",
      fields: [{ type: "textarea", key: "note", label: "Kérelem", required: true }],
    });
  }
  return requests.submit(visitor, {
    formKey: "teszt",
    data: { note: "TITKOS-SZOVEG" },
    consent: true,
    consentTextHash: "teszt-hozzajarulas",
  });
}

beforeEach(() => clearOutbox());

describe("demo outbox (composition root accessor)", () => {
  it("lists what a repository action would have sent, oldest first, with only reference and link", async () => {
    const { reference, id } = await submitRequest();
    const messages = listOutbox();
    expect(messages.map((m) => [m.channel, m.template])).toEqual([
      ["email", "request.officeNotification"],
      ["email", "request.confirmation"],
    ]);
    expect(messages[0]!.recipient).toEqual({ kind: "persona", persona: "office" });
    expect(messages[0]!.params).toEqual({ reference, link: `/admin/kerelmek/${id}` });
    expect(JSON.stringify(messages)).not.toContain("TITKOS-SZOVEG");
  });

  it("clears the outbox", async () => {
    await submitRequest();
    expect(listOutbox()).toHaveLength(2);
    clearOutbox();
    expect(listOutbox()).toEqual([]);
  });

  it("renders the listed messages through the real templates with Hungarian copy", async () => {
    const { reference } = await submitRequest();
    for (const message of listOutbox()) {
      const mail = await renderEmail(
        message.template,
        message.params,
        emailContextFor(message, "http://localhost:3100"),
      );
      expect(mail.html).toContain(reference);
      expect(mail.text).toContain(reference);
      expect(mail.html).not.toContain("TITKOS-SZOVEG");
      expect(mail.subject).toContain(reference);
    }
  });
});

describe("email context", () => {
  it("resolves every template's copy with the real next-intl translator", () => {
    const message = {
      id: "o-1",
      at: "2026-11-12T10:00:00Z",
      channel: "push" as const,
      recipient: { kind: "persona" as const, persona: "team" },
      tenant: null,
      params: { link: "/x", reference: "KER-2026-0001", startsAt: "2026-11-15T17:00:00Z" },
    };
    for (const template of EMAIL_TEMPLATE_KEYS) {
      const ctx = emailContextFor({ ...message, template }, "http://localhost:3100");
      const push = renderPush(template, message.params, ctx);
      expect(push.title.length, template).toBeGreaterThan(0);
      expect(push.body.length, template).toBeGreaterThan(0);
    }
  });

  it("uses the tenant's denomination terms", () => {
    const base = {
      id: "o-1",
      at: "2026-11-12T10:00:00Z",
      channel: "push" as const,
      template: "plan.approved" as const,
      recipient: { kind: "persona" as const, persona: "team" },
      params: { link: "/x" },
    };
    const tenant = (denomination: "rk" | "ref") => ({
      id: "t",
      name: "Minta Egyházközség",
      denomination,
      terminology: {},
    });
    const body = (denomination: "rk" | "ref") =>
      renderPush(
        "plan.approved",
        base.params,
        emailContextFor({ ...base, tenant: tenant(denomination) }, "http://localhost:3100"),
      ).body;
    expect(body("rk")).toBe("Jóváhagyták a szentmise tervét.");
    expect(body("ref")).toBe("Jóváhagyták az istentisztelet tervét.");
  });
});

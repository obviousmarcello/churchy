import { describe, expect, it } from "vitest";
import {
  EMAIL_TEMPLATES,
  EMAIL_TEMPLATE_KEYS,
  REFERENCE_ONLY_TEMPLATES,
  absoluteLink,
  isEmailTemplateKey,
  renderEmail,
  renderPush,
  type EmailParams,
  type EmailTemplateKey,
} from "./index";
import { catalog, contextFor, type TestDenomination } from "./testing";

/** Realistic params per template, as the mock adapter writes them to the outbox. */
const PARAMS: Record<EmailTemplateKey, EmailParams> = {
  "request.officeNotification": { reference: "KER-2026-0042", link: "/admin/kerelmek/req-m1" },
  "request.confirmation": { reference: "KER-2026-0042" },
  "hr.ticketCreated": { reference: "HR-2026-0007", link: "/munkater/hr/hr-m1" },
  "hr.ticketReceived": { reference: "HR-2026-0007", link: "/munkater/hr/hr-m1" },
  "hr.ticketUpdated": { reference: "HR-2026-0007", link: "/munkater/hr/hr-m1" },
  "assignment.requested": {
    assignmentId: "as-1",
    startsAt: "2026-11-15T17:00:00Z",
    link: "/munkater/beosztas/as-1",
  },
  "assignment.swapRequested": {
    assignmentId: "as-1",
    startsAt: "2026-11-15T17:00:00Z",
    link: "/munkater/beosztas/as-1",
  },
  "assignment.swapAccepted": {
    assignmentId: "as-1",
    startsAt: "2026-11-15T17:00:00Z",
    link: "/munkater/beosztas/as-1",
  },
  "booking.requested": { bookingId: "bk-1", link: "/munkater/termek/foglalasok/bk-1" },
  "booking.decided": {
    bookingId: "bk-1",
    decision: "approved",
    link: "/munkater/termek/foglalasok/bk-1",
  },
  "plan.reviewRequested": { planId: "pl-1", link: "/munkater/szolgalatok/pl-1" },
  "plan.approved": { planId: "pl-1", link: "/munkater/szolgalatok/pl-1" },
  "plan.mention": { planId: "pl-1", link: "/munkater/szolgalatok/pl-1" },
  "member.invitation": { link: "/belepes" },
  "billing.paymentFailed": { link: "/admin/elofizetes" },
};

const MESSAGE_PARTS = ["subject", "preheader", "heading", "body", "cta", "pushTitle", "pushBody"];

/** HTML to text, enough to search for content without markup noise. */
const visibleText = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("template catalog", () => {
  it("has one template per outbox key", () => {
    expect(Object.keys(EMAIL_TEMPLATES).sort()).toEqual([...EMAIL_TEMPLATE_KEYS].sort());
    expect(Object.keys(PARAMS).sort()).toEqual([...EMAIL_TEMPLATE_KEYS].sort());
    for (const key of EMAIL_TEMPLATE_KEYS) expect(isEmailTemplateKey(key)).toBe(true);
    expect(isEmailTemplateKey("request.unknown")).toBe(false);
    expect(isEmailTemplateKey("toString")).toBe(false);
  });

  it("has Hungarian copy in messages/hu.json for every template, in the formal address", () => {
    const email = catalog["email"] as Record<string, Record<string, Record<string, string>>>;
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const [family, name] = key.split(".") as [string, string];
      for (const part of MESSAGE_PARTS) {
        const text = email[family]?.[name]?.[part];
        expect(typeof text, `email.${key}.${part}`).toBe("string");
        expect(text, `email.${key}.${part}`).not.toMatch(
          /\b(te|neked|téged|kérlek|add meg|kattints)\b/i,
        );
      }
    }
  });
});

describe("rendering through React Email", () => {
  for (const key of EMAIL_TEMPLATE_KEYS) {
    it(`${key}: renders HTML and plain text with the Hungarian copy`, async () => {
      const ctx = contextFor();
      const mail = await renderEmail(key, PARAMS[key], ctx);

      expect(mail.subject).toBe(EMAIL_TEMPLATES[key].subject(PARAMS[key], ctx));
      expect(mail.subject.length).toBeGreaterThan(5);
      expect(mail.html).toMatch(/^<!DOCTYPE html/i);
      expect(mail.html).toContain('lang="hu"');
      expect(visibleText(mail.html)).toContain("Belvárosi Plébánia");
      expect(mail.text).toContain("Belvárosi Plébánia");
      expect(mail.text).not.toMatch(/<[a-z]+[ >]/i);

      expect(visibleText(mail.html)).toContain("Churchy");
      if (mail.link) {
        expect(visibleText(mail.html)).toContain(ctx.t(`${key}.cta`));
        expect(mail.html).toContain(mail.link);
        expect(mail.text).toContain(mail.link);
        expect(mail.link.startsWith("https://demo.churchy.test/")).toBe(true);
      }
    });

    it(`${key}: has a push title and body`, () => {
      const push = renderPush(key, PARAMS[key], contextFor());
      expect(push.title.length).toBeGreaterThan(2);
      expect(push.body.length).toBeGreaterThan(5);
    });
  }

  it("shows the assignment time in Hungarian, in Budapest time", async () => {
    const mail = await renderEmail(
      "assignment.requested",
      PARAMS["assignment.requested"]!,
      contextFor(),
    );
    expect(mail.subject).toBe("Új szolgálati beosztás: 2026. november 15., vasárnap, 18:00");
    expect(visibleText(mail.html)).toContain("2026. november 15., vasárnap, 18:00");
  });

  it("shows the booking decision", async () => {
    const ctx = contextFor();
    const approved = await renderEmail("booking.decided", PARAMS["booking.decided"]!, ctx);
    expect(approved.subject).toBe("Döntés született a foglalásáról: Jóváhagyva");
    const rejected = await renderEmail(
      "booking.decided",
      { bookingId: "bk-1", decision: "rejected", link: "/x" },
      ctx,
    );
    expect(rejected.subject).toBe("Döntés született a foglalásáról: Elutasítva");
  });

  it("renders without optional params (no time, no link)", async () => {
    const ctx = contextFor();
    const mail = await renderEmail("assignment.requested", {}, ctx);
    expect(mail.link).toBeNull();
    expect(mail.html).not.toContain("<a ");
    expect(renderPush("assignment.requested", {}, ctx).link).toBeNull();
  });

  it("uses the denomination's own terms, never a hard-coded one", async () => {
    const subjects = {} as Record<TestDenomination, string>;
    for (const denomination of ["rk", "ref", "bapt"] as const) {
      subjects[denomination] = (
        await renderEmail(
          "plan.reviewRequested",
          PARAMS["plan.reviewRequested"]!,
          contextFor(denomination),
        )
      ).subject;
    }
    expect(subjects.rk).toBe("Jóváhagyásra vár a szentmise terve");
    expect(subjects.ref).toBe("Jóváhagyásra vár az istentisztelet terve");
    expect(subjects.bapt).toBe("Jóváhagyásra vár az istentisztelet terve");
    for (const key of ["plan.approved", "plan.mention"] as const) {
      const reformed = await renderEmail(key, PARAMS[key], contextFor("ref"));
      expect(reformed.html.toLowerCase()).not.toContain("szentmise");
      expect(reformed.text.toLowerCase()).not.toContain("szentmise");
    }
  });
});

describe("links", () => {
  it("accepts app paths only", () => {
    const base = "https://demo.churchy.test";
    expect(absoluteLink("/admin/kerelmek/1", base)).toBe(
      "https://demo.churchy.test/admin/kerelmek/1",
    );
    for (const bad of [
      "https://evil.example/x",
      "//evil.example/x",
      "javascript:alert(1)",
      "admin/kerelmek",
      "",
      null,
      42,
      undefined,
    ]) {
      expect(absoluteLink(bad, base), String(bad)).toBeNull();
    }
    expect(absoluteLink("/x", "not a url")).toBeNull();
  });

  it("never turns a hostile link param into a link", async () => {
    const mail = await renderEmail(
      "member.invitation",
      { link: "javascript:alert(1)" },
      contextFor(),
    );
    expect(mail.link).toBeNull();
    expect(mail.html).not.toContain("javascript:");
  });
});

/**
 * D-91 AC / CLAUDE.md: emails about requests and HR tickets contain ONLY the reference number, the
 * category and a link. The test feeds the templates params that carry content and proves none of
 * it appears, and that the templates never even read it.
 */
describe("request and HR mails carry only reference, category and link", () => {
  const SECRETS = {
    name: "Titkos Tivadar",
    email: "titkos.tivadar@example.test",
    phone: "+36 30 000 0000",
    note: "TITKOS-KERELEM-SZOVEG",
    subject: "TITKOS-TARGY",
    content: "TITKOS-TARTALOM",
    health: "TITKOS-EGESZSEGUGYI-ADAT",
    leaveDays: 987654,
  };
  const ALLOWED = new Set(["reference", "link"]);

  for (const key of REFERENCE_ONLY_TEMPLATES) {
    describe(key, () => {
      const reference = "KER-2026-0042";
      const params: EmailParams = { reference, link: "/admin/kerelmek/req-m1", ...SECRETS };

      it("never reads any param except reference and link", async () => {
        const read = new Set<string>();
        const spy = new Proxy(params, {
          get(target, prop, receiver) {
            if (typeof prop === "string") read.add(prop);
            return Reflect.get(target, prop, receiver);
          },
          has(target, prop) {
            if (typeof prop === "string") read.add(prop);
            return Reflect.has(target, prop);
          },
          ownKeys(target) {
            read.add("<enumerated>");
            return Reflect.ownKeys(target);
          },
        });
        const ctx = contextFor();
        await renderEmail(key, spy, ctx);
        renderPush(key, spy, ctx);
        EMAIL_TEMPLATES[key].subject(spy, ctx);
        expect([...read].filter((name) => !ALLOWED.has(name))).toEqual([]);
      });

      it("shows the reference, the category and the link, and none of the submitted content", async () => {
        const ctx = contextFor();
        const mail = await renderEmail(key, params, ctx);
        const push = renderPush(key, params, ctx);
        const everything = [mail.subject, mail.html, mail.text, push.title, push.body].join("\n");

        expect(everything).toContain(reference);
        const category = ctx.t(
          key.startsWith("hr.") ? "labels.categoryHr" : "labels.categoryRequest",
        );
        expect(visibleText(mail.html)).toContain(category);
        expect(mail.text).toContain(category);
        if (key !== "request.confirmation") {
          expect(mail.link).toBe("https://demo.churchy.test/admin/kerelmek/req-m1");
          expect(mail.html).toContain("https://demo.churchy.test/admin/kerelmek/req-m1");
        }

        for (const secret of Object.values(SECRETS)) {
          expect(everything, String(secret)).not.toContain(String(secret));
        }
      });

      it("has a catalog text that uses no placeholder other than the reference", () => {
        const [family, name] = key.split(".") as [string, string];
        const messages = (
          catalog["email"] as Record<string, Record<string, Record<string, string>>>
        )[family]![name]!;
        for (const [part, text] of Object.entries(messages)) {
          const placeholders = [...text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
          expect(
            placeholders.filter((p) => p !== "reference"),
            `email.${key}.${part}`,
          ).toEqual([]);
        }
      });
    });
  }
});

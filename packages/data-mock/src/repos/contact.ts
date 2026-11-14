/** Mock repository: the public contact form (D-12). */
import type { ContactRepo } from "@churchy/contracts";
import { ContactMessageInputSchema, parseInput, requireTenantId } from "@churchy/contracts";
import { budapestYear, send, type RepoDeps } from "./helpers";

/**
 * Instead of sending, the message is written to the outbox as `contact.message` addressed to the
 * office. Its email carries the message itself (the office needs it to answer); no confirmation
 * goes to the address the visitor typed, so the form cannot be used to send mail to strangers.
 * Real delivery, Reply-To and the rate limit are the BE part.
 */
export function mockContact({ store }: RepoDeps): ContactRepo {
  return {
    async submit(ctx, input) {
      // Like `requests.submit`, an anonymous write: any tenant ctx may send.
      const tenantId = requireTenantId(ctx);
      const data = parseInput(ContactMessageInputSchema, input);
      // Unique within the store (and deterministic after a reset).
      const serial = Number(store.nextId("kap").split("-m")[1]);
      const reference = `KAP-${budapestYear(store.nowIso())}-${String(serial).padStart(4, "0")}`;
      send(store, {
        channel: "email",
        template: "contact.message",
        recipient: { kind: "persona", persona: "office" },
        tenantId,
        params: {
          reference,
          name: data.name,
          email: data.email,
          phone: data.phone,
          subject: data.subject,
          message: data.message,
        },
      });
      return { reference };
    },
  };
}

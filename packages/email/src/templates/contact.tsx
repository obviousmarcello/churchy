import { formatPhone } from "@churchy/hu";
import { defineTemplate } from "../define";
import type { Fact } from "../frame";
import { textOf } from "../params";

const phoneOf = (value: string | null): string | null => (value ? formatPhone(value) : null);

/**
 * Contact form message to the office (FR-008, D-12). Unlike request and HR mails, this one carries
 * the message: the visitor writes to the office and the email is how it gets there (SDD §7.5).
 * The subject line and the push notification hold only the reference number, never the content.
 * The sender's address goes into Reply-To when the BE part sends it.
 */
export const ContactMessage = defineTemplate("contact.message", {
  link: false,
  values: (params) => ({ reference: textOf(params, "reference") ?? "" }),
  facts: (params, t) => {
    const facts: Fact[] = [
      { label: t("labels.reference"), value: textOf(params, "reference") ?? "" },
      { label: t("labels.senderName"), value: textOf(params, "name") ?? "" },
      { label: t("labels.senderEmail"), value: textOf(params, "email") ?? "" },
    ];
    const phone = phoneOf(textOf(params, "phone"));
    if (phone) facts.push({ label: t("labels.senderPhone"), value: phone });
    facts.push({ label: t("labels.subject"), value: textOf(params, "subject") ?? "" });
    return facts;
  },
  quote: (params, t) => {
    const text = textOf(params, "message");
    return text ? { label: t("labels.message"), text } : null;
  },
});

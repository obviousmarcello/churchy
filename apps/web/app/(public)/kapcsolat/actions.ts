"use server";

import { contactValues, isBot, parseContactForm } from "@/lib/contact-form";
import type { ContactFormState } from "@/lib/contact-form-state";
import { getT } from "@/i18n/server";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";

/**
 * *Kapcsolat* form (D-12): honeypot, Hungarian validation, then `contact.submit` through the
 * repository interface. The mock adapter writes the email to the demo outbox; real delivery and
 * the rate limit (hashed IP + tenant, SDD §13) are the BE part.
 */
export async function sendContactMessage(
  _previous: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  // A bot filled the hidden field: pretend success, send nothing.
  if (isBot(form)) return { status: "sent", reference: null };

  const t = await getT("public.contact.form.errors");
  const parsed = parseContactForm(contactValues(form), {
    required: t("required"),
    phone: t("phone"),
    consent: t("consent"),
  });
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values: parsed.values };

  try {
    const { contact } = await getRequestRepositories();
    const { reference } = await contact.submit(await getPublicCtx(), parsed.input);
    return { status: "sent", reference };
  } catch {
    // No details to the visitor and no content in logs (CLAUDE.md privacy rules).
    return { status: "failed", values: parsed.values };
  }
}

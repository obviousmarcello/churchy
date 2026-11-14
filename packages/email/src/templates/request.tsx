import { defineTemplate, type TemplateSpec } from "../define";
import { textOf } from "../params";

/**
 * Pastoral requests (SDD §12): the mails carry ONLY the reference number, the category and a link.
 * The submitted content never leaves the system by email (CLAUDE.md, D-54 AC4).
 */
const spec: TemplateSpec = {
  values: (params) => ({ reference: textOf(params, "reference") ?? "" }),
  facts: (params, t) => [
    { label: t("labels.reference"), value: textOf(params, "reference") ?? "" },
    { label: t("labels.category"), value: t("labels.categoryRequest") },
  ],
};

/** Mail to the parish office: a new request arrived. */
export const RequestOfficeNotification = defineTemplate("request.officeNotification", spec);

/** Confirmation to the person who submitted the request (no link: they have no account). */
export const RequestConfirmation = defineTemplate("request.confirmation", {
  ...spec,
  link: false,
});

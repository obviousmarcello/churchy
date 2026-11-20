import { defineTemplate, type TemplateSpec } from "../define";
import { textOf } from "../params";

/**
 * HR tickets (SDD §12, §25): reference number, category and link only — never the content of the
 * ticket, the requester's name or any health or leave details.
 */
const spec: TemplateSpec = {
  values: (params) => ({ reference: textOf(params, "reference") ?? "" }),
  facts: (params, t) => [
    { label: t("labels.reference"), value: textOf(params, "reference") ?? "" },
    { label: t("labels.category"), value: t("labels.categoryHr") },
  ],
};

/** Mail to the handlers: a new ticket is waiting. */
export const HrTicketCreated = defineTemplate("hr.ticketCreated", spec);

/** Receipt for the requester. */
export const HrTicketReceived = defineTemplate("hr.ticketReceived", spec);

/** The requester's ticket changed (status, assignee, a reply). */
export const HrTicketUpdated = defineTemplate("hr.ticketUpdated", spec);

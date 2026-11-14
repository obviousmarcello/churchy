import { defineTemplate, type TemplateSpec } from "../define";
import { textOf } from "../params";
import type { EmailParams, Translate } from "../types";

/** Room bookings (SDD §23). The decision label comes from the message catalog. */
const decisionLabel = (params: EmailParams, t: Translate) =>
  t(textOf(params, "decision") === "approved" ? "labels.approved" : "labels.rejected");

const decisionSpec: TemplateSpec = {
  values: (params, t) => ({ decision: decisionLabel(params, t) }),
  facts: (params, t) => [{ label: t("labels.decision"), value: decisionLabel(params, t) }],
};

/** A booking request is waiting for the room's managers. */
export const BookingRequested = defineTemplate("booking.requested");

/** The managers decided on the request. */
export const BookingDecided = defineTemplate("booking.decided", decisionSpec);

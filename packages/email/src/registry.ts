import type { EmailTemplate } from "./define";
import { BillingPaymentFailed, MemberInvitation } from "./templates/account";
import {
  AssignmentRequested,
  AssignmentSwapAccepted,
  AssignmentSwapRequested,
} from "./templates/assignment";
import { BookingDecided, BookingRequested } from "./templates/booking";
import { ContactMessage } from "./templates/contact";
import { MusicEventAdded, MusicEventReminder, MusicSetlist } from "./templates/music";
import { HrTicketCreated, HrTicketReceived, HrTicketUpdated } from "./templates/hr";
import { PlanApproved, PlanMention, PlanReviewRequested } from "./templates/plan";
import { RequestConfirmation, RequestOfficeNotification } from "./templates/request";
import type { EmailTemplateKey } from "./types";

/** One template per outbox template key (the type forces the table to stay complete). */
export const EMAIL_TEMPLATES: Readonly<Record<EmailTemplateKey, EmailTemplate>> = {
  "request.officeNotification": RequestOfficeNotification,
  "request.confirmation": RequestConfirmation,
  "hr.ticketCreated": HrTicketCreated,
  "hr.ticketReceived": HrTicketReceived,
  "hr.ticketUpdated": HrTicketUpdated,
  "assignment.requested": AssignmentRequested,
  "assignment.swapRequested": AssignmentSwapRequested,
  "assignment.swapAccepted": AssignmentSwapAccepted,
  "booking.requested": BookingRequested,
  "booking.decided": BookingDecided,
  "plan.reviewRequested": PlanReviewRequested,
  "plan.approved": PlanApproved,
  "plan.mention": PlanMention,
  "member.invitation": MemberInvitation,
  "billing.paymentFailed": BillingPaymentFailed,
  "contact.message": ContactMessage,
  "music.eventAdded": MusicEventAdded,
  "music.eventReminder": MusicEventReminder,
  "music.setlist": MusicSetlist,
};

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return Object.hasOwn(EMAIL_TEMPLATES, value);
}

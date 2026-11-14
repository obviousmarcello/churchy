import { defineTemplate } from "../define";

/** Workspace invitations and billing notices (SDD §4.4, §20). Link only. */

/** A new member is invited to the workspace. */
export const MemberInvitation = defineTemplate("member.invitation");

/** A subscription payment failed. */
export const BillingPaymentFailed = defineTemplate("billing.paymentFailed");

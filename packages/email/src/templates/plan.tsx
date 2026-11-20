import { defineTemplate } from "../define";

/**
 * Worship plans (SDD §19). The link is the only parameter used; comment text of a mention never
 * leaves the workspace. The denomination's term for a service comes from the message catalog
 * (`{service.lower}` …), so a Reformed church reads *istentisztelet*, never *szentmise*.
 */

/** A plan was sent to review: mail and push for the approvers. */
export const PlanReviewRequested = defineTemplate("plan.reviewRequested");

/** The plan was approved: push for its leader. */
export const PlanApproved = defineTemplate("plan.approved");

/** Someone was mentioned in a plan comment. */
export const PlanMention = defineTemplate("plan.mention");

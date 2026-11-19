import type { ApprovalPolicy } from "@churchy/contracts";

export interface Requester {
  /** Workspace roles of the requester (`leader`, `employee`, …). */
  readonly roles: readonly string[];
  /** Teams the requester is a member of. */
  readonly teamIds: readonly string[];
  /** True when `can("booking.approve")` allows the requester for this room. */
  readonly mayApprove: boolean;
}

export interface Approval {
  readonly status: "approved" | "pending";
  /** Pending requests are tentative holds that expire (SDD §23.2). */
  readonly holdExpiresAt: string | null;
}

/**
 * The status a new booking starts with: approved when the requester may approve the room, has an
 * auto-approve role, or books for one of the room's auto-approve teams they belong to; otherwise a
 * tentative hold for `holdHours`.
 */
export function decideApproval(
  policy: ApprovalPolicy,
  who: Requester,
  teamId: string | null,
  now: Date,
): Approval {
  const roles: readonly string[] = policy.autoApprove.roles;
  const auto =
    who.mayApprove ||
    who.roles.some((r) => roles.includes(r)) ||
    (teamId !== null &&
      who.teamIds.includes(teamId) &&
      policy.autoApprove.teamIds.includes(teamId));
  if (auto) return { status: "approved", holdExpiresAt: null };
  return {
    status: "pending",
    holdExpiresAt: new Date(now.getTime() + policy.holdHours * 3_600_000).toISOString(),
  };
}

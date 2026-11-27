// The reply of a volunteer to an event: can they come? Null means no reply
// yet. Keep in sync with the check on `event_volunteers.reply`
// (`20261023120000_volunteer_replies.sql`).

export const VOLUNTEER_REPLIES = ["yes", "maybe", "no"] as const;

export type VolunteerReply = (typeof VOLUNTEER_REPLIES)[number];

/** The number of volunteers with each reply. `none`: no reply yet. */
export function countReplies(
  volunteers: { reply: VolunteerReply | null }[],
): Record<VolunteerReply | "none", number> {
  const counts = { yes: 0, maybe: 0, no: 0, none: 0 };
  for (const { reply } of volunteers) counts[reply ?? "none"]++;
  return counts;
}

import type { EditScope, RuleViolation } from "@churchy/booking";

/** What the booking form sends (plain strings as typed; the server validates). */
export interface BookingFormInput {
  roomId: string;
  /** Budapest civil date `YYYY-MM-DD`. */
  date: string;
  /** Budapest wall-clock `HH:MM`. */
  startTime: string;
  endTime: string;
  title: string;
  purpose: string;
  attendees: string;
  setupNotes: string;
  teamId: string;
  repeat: "none" | "weekly";
  /** ISO weekdays 1…7 of a weekly series. */
  weekdays: number[];
  /** Last day of a weekly series (`YYYY-MM-DD`); clamped to 12 months. */
  until: string;
  /** Book the free occurrences of a series and leave the clashing ones out. */
  skipConflicts: boolean;
}

export interface ClashInfo {
  title: string;
  startsAt: string;
  endsAt: string;
  /** `service`: blocked by a service of the schedule. */
  source: "user" | "service" | "external";
  mine: boolean;
}

/** An occurrence of a series that cannot be booked. */
export interface BlockedOccurrence {
  startsAt: string;
  /** Title of the booking or service in the way, or the broken rule. */
  title: string | null;
  rule: RuleViolation["rule"] | null;
  /** The limit or closure name of the broken rule (message parameter). */
  detail: string | number | null;
  source: ClashInfo["source"] | null;
}

export interface AlternativeRoom {
  id: string;
  name: string;
  capacity: number | null;
}

export interface AlternativeSlot {
  startsAt: string;
  endsAt: string;
}

/** The live check of a request (also what a refused save answers). */
export interface BookingCheck {
  /** False while date/time/title are missing or malformed: nothing to evaluate yet. */
  ready: boolean;
  problem: "room" | "time" | "weekdays" | null;
  violations: RuleViolation[];
  clash: ClashInfo | null;
  alternativeRooms: AlternativeRoom[];
  alternativeSlots: AlternativeSlot[];
  /** Weekly series: counts and the blocked occurrences (*„52 alkalomból 3 ütközik”*). */
  series: { total: number; blocked: BlockedOccurrence[] } | null;
  /** What the booking would start as: approved or a tentative hold. */
  status: "approved" | "pending";
  holdHours: number | null;
}

export type CreateOutcome =
  | {
      result: "created";
      id: string;
      created: number;
      skipped: number;
      status: "approved" | "pending";
    }
  | { result: "refused"; check: BookingCheck }
  | { result: "missing"; fields: ("title" | "time")[] };

export interface EditInput {
  scope: EditScope;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  purpose: string;
  attendees: string;
  setupNotes: string;
}

export type EditOutcome =
  | { result: "saved"; count: number }
  | { result: "refused"; violations: RuleViolation[]; clash: ClashInfo | null }
  | { result: "missing"; fields: ("title" | "time")[] }
  | { result: "notAllowed" };

import type {
  AssignmentStatus,
  BookingStatus,
  EventVisibility,
  PlanStatus,
} from "@churchy/contracts";
import { getT } from "@/i18n/server";
import type { Layer } from "@/lib/workspace/calendar";

/** The translated strings of calendar entries, built once per request (not per entry). */
export interface EntryLabels {
  allDay: string;
  absent: string;
  cancelled: string;
  draft: string;
  publicHoliday: string;
  layers: Record<Layer, string>;
  planStatus: Record<PlanStatus, string>;
  bookingStatus: Record<BookingStatus, string>;
  assignmentStatus: Record<AssignmentStatus, string>;
  visibility: Record<EventVisibility, string>;
}

export async function getEntryLabels(): Promise<EntryLabels> {
  const t = await getT("munkater.entry");
  return {
    allDay: t("allDay"),
    absent: t("absent"),
    cancelled: t("cancelled"),
    draft: t("draft"),
    publicHoliday: t("publicHoliday"),
    layers: {
      events: t("layers.events"),
      services: t("layers.services"),
      bookings: t("layers.bookings"),
      assignments: t("layers.assignments"),
      absences: t("layers.absences"),
      holidays: t("layers.holidays"),
    },
    planStatus: {
      draft: t("planStatus.draft"),
      in_review: t("planStatus.in_review"),
      approved: t("planStatus.approved"),
      locked: t("planStatus.locked"),
    },
    bookingStatus: {
      pending: t("bookingStatus.pending"),
      approved: t("bookingStatus.approved"),
      rejected: t("bookingStatus.rejected"),
      cancelled: t("bookingStatus.cancelled"),
    },
    assignmentStatus: {
      requested: t("assignmentStatus.requested"),
      accepted: t("assignmentStatus.accepted"),
      declined: t("assignmentStatus.declined"),
      swap_requested: t("assignmentStatus.swap_requested"),
      cancelled: t("assignmentStatus.cancelled"),
    },
    visibility: {
      private: t("visibility.private"),
      team: t("visibility.team"),
      staff: t("visibility.staff"),
      public: t("visibility.public"),
    },
  };
}

// @churchy/hr — HR rules: working-day and leave calculation, approval chains, ticket lifecycle,
// SLA clock and dashboard figures (SDD §25, D-71 … D-74). Pure and timezone-safe (Europe/Budapest);
// used identically by every data adapter and the UI.
export {
  EMPTY_CALENDAR,
  MAX_PERIOD_DAYS,
  breakdown,
  buildWorkdayCalendar,
  countsAsWorkday,
  dayKind,
  isPublicWorkday,
  workingDays,
  worksOn,
  type DayBreakdown,
  type DayKind,
  type WorkdayCalendar,
  type WorkdayEntry,
  type WorkdayKind,
  type WorkingDaysInput,
} from "./workdays";
export {
  REGULAR_LEAVE,
  leaveBalance,
  type AbsenceInput,
  type EntitlementInput,
  type LeaveBalance,
} from "./leave";
export {
  chainProgress,
  isHrStep,
  resolveChain,
  type ChainContext,
  type ChainProgress,
  type ChainStep,
  type RecordedDecision,
  type ResolvedStep,
  type StepOutcome,
} from "./chain";
export {
  TICKET_STATUSES,
  allowedTransitions,
  canTransition,
  initialStatus,
  isOpen,
  type TicketStatus,
} from "./lifecycle";
export {
  DEFAULT_WORKING_HOURS,
  REMINDER_RATIO,
  addWorkingMinutes,
  dueAt,
  slaStatus,
  workingMinutesBetween,
  type SlaState,
  type SlaStatus,
  type WorkingHours,
} from "./sla";
export {
  median,
  ticketStats,
  type CategoryStats,
  type StatTicket,
  type TicketStats,
} from "./stats";

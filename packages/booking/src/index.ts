// @churchy/booking — room booking rules, conflict alternatives, series expansion and service
// blocks (SDD §23, D-60/D-61). Pure TypeScript; Europe/Budapest wall-clock time. Used by the web
// app and both data adapters' callers.
export { decideApproval, type Approval, type Requester } from "./approval";
export {
  findAlternatives,
  findClash,
  type Alternatives,
  type AlternativesInput,
  type FreeSlot,
  type Occupancy,
  type Slot,
} from "./conflicts";
export { checkRules, type RuleKey, type RuleViolation } from "./rules";
export {
  conflictSummary,
  expandWeekly,
  retime,
  scopeTargets,
  seriesHorizon,
  SERIES_HORIZON_DAYS,
  weeklyRule,
  type EditScope,
  type Occurrence,
  type SeriesMember,
  type WeeklySeries,
} from "./series";
export { mergeOccupancies, serviceOccupancies, type BlockableService } from "./service-blocks";
export { localParts, localToInstant, minutesOf } from "./time";

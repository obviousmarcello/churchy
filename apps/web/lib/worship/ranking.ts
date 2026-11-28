/**
 * Candidate ranking for a position (SDD §24.4, D-67): hard filters first (inactive, member of the
 * team with this position, approved absence, overlapping assignment), then a soft score — fewer
 * assignments in the last 8 weeks first, below the personal monthly maximum. Pure; demo depth:
 * the reasons are keys the page translates.
 */

export interface RankPerson {
  readonly id: string;
  readonly active: boolean;
  /** Positions the person holds in the team. */
  readonly positionIds: readonly string[];
  readonly maxPerMonth: number | null;
}

export interface RankAssignment {
  readonly personId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface RankAbsence {
  readonly personId: string;
  /** Civil dates, inclusive. */
  readonly startDate: string;
  readonly endDate: string;
}

export type RankReason =
  | { kind: "notServed"; weeks: number }
  | { kind: "servedRecently"; count: number }
  | { kind: "overMonthlyMax" };

export interface Candidate {
  readonly personId: string;
  readonly score: number;
  readonly reasons: readonly RankReason[];
}

const WEEK_MS = 7 * 86_400_000;

export interface RankInput {
  readonly positionId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** Civil date of the service in Europe/Budapest. */
  readonly date: string;
  readonly members: readonly RankPerson[];
  readonly absences: readonly RankAbsence[];
  /** Every assignment of those people (any status other than declined / cancelled). */
  readonly assignments: readonly RankAssignment[];
}

/** Candidates that pass every hard filter, best first; ties keep the input order. */
export function rankCandidates(input: RankInput): Candidate[] {
  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  const monthPrefix = input.date.slice(0, 7);
  return input.members
    .filter((m) => m.active && m.positionIds.includes(input.positionId))
    .filter(
      (m) =>
        !input.absences.some(
          (a) => a.personId === m.id && a.startDate <= input.date && input.date <= a.endDate,
        ),
    )
    .filter(
      (m) =>
        !input.assignments.some(
          (a) =>
            a.personId === m.id && Date.parse(a.startsAt) < end && Date.parse(a.endsAt) > start,
        ),
    )
    .map((m): Candidate => {
      const mine = input.assignments.filter((a) => a.personId === m.id);
      const recent = mine.filter((a) => {
        const t = Date.parse(a.startsAt);
        return t < start && start - t <= 8 * WEEK_MS;
      });
      const thisMonth = mine.filter((a) => a.startsAt.slice(0, 7) === monthPrefix).length;
      const over = m.maxPerMonth !== null && thisMonth >= m.maxPerMonth;
      const lastServed = mine.map((a) => Date.parse(a.startsAt)).filter((t) => t < start);
      const reasons: RankReason[] = [];
      if (recent.length === 0) {
        reasons.push({
          kind: "notServed",
          weeks:
            lastServed.length === 0
              ? 8
              : Math.max(8, Math.floor((start - Math.max(...lastServed)) / WEEK_MS)),
        });
      } else {
        reasons.push({ kind: "servedRecently", count: recent.length });
      }
      if (over) reasons.push({ kind: "overMonthlyMax" });
      return { personId: m.id, score: recent.length + (over ? 100 : 0), reasons };
    })
    .sort((a, b) => a.score - b.score);
}

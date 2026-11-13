import type { IsoDate } from "./date";
import type { LiturgicalRank, LiturgicalSeason } from "./types";

/** A named celebration attached to a date, before precedence is applied. */
export interface Celebration {
  key: string;
  name: string;
  rank: LiturgicalRank;
  /**
   * Position in the table of precedence — lower wins (1 = Triduum, 2 = principal
   * feasts and privileged Sundays, 3 = general solemnities, 4 = proper solemnities,
   * 5 = feasts of the Lord, 6 = other Sundays, 7 = feasts of saints, 9 = privileged
   * weekdays, 10 = memorials, 13 = weekdays).
   */
  precedence: number;
  notable: boolean;
  /**
   * True when the celebration *is* the temporal-cycle Sunday (Easter, Pentecost,
   * Krisztus Király …), so `sundayName` takes its name. False for saints' days and
   * other celebrations that merely displace a Sunday.
   */
  temporal: boolean;
}

/** Season-level facts for a date, before celebrations are applied. */
export interface TemporalPosition {
  season: LiturgicalSeason;
  seasonName: string;
  week: number | null;
  /** Ordinal name of the Sunday, if this is a Sunday that has one. */
  sundayName: string | null;
  /** Stable key for that Sunday, e.g. `"ordinary-33"`. */
  sundayKey: string | null;
  /** Liturgical year (civil year in which the church year ends). */
  liturgicalYear: number;
}

export interface CelebrationOptions {
  notable?: boolean;
  temporal?: boolean;
}

export function celebration(
  key: string,
  name: string,
  rank: LiturgicalRank,
  precedence: number,
  options: CelebrationOptions = {},
): Celebration {
  return {
    key,
    name,
    rank,
    precedence,
    notable: options.notable ?? (rank !== "sunday" && rank !== "weekday"),
    temporal: options.temporal ?? false,
  };
}

export type CelebrationTable = ReadonlyMap<IsoDate, readonly Celebration[]>;

export class CelebrationTableBuilder {
  private readonly table = new Map<IsoDate, Celebration[]>();

  add(date: IsoDate, item: Celebration): this {
    const list = this.table.get(date);
    if (list) list.push(item);
    else this.table.set(date, [item]);
    return this;
  }

  build(): CelebrationTable {
    return this.table;
  }
}

import type { IsoDate, IsoWeekday } from "./date";

/**
 * Which church-year tradition to name days by.
 *
 * - `catholic` — General Roman Calendar with the Hungarian proper (Római katolikus;
 *   Görögkatolikus presets fall back to it until a Byzantine calendar exists).
 * - `protestant` — Hungarian Lutheran/Reformed church year (Evangélikus, Református,
 *   and the other non-Catholic presets).
 */
export type LiturgicalFamily = "catholic" | "protestant";

export const LITURGICAL_FAMILIES: readonly LiturgicalFamily[] = ["catholic", "protestant"];

/**
 * Season of the church year. Catholic days use `advent`, `christmas`, `ordinary`,
 * `lent`, `triduum`, `easter`; Protestant days use `advent`, `christmas`, `epiphany`,
 * `preLent`, `lent`, `easter`, `trinity`.
 */
export type LiturgicalSeason =
  | "advent"
  | "christmas"
  | "epiphany"
  | "preLent"
  | "lent"
  | "triduum"
  | "easter"
  | "ordinary"
  | "trinity";

/**
 * Rank of the day's celebration, highest first.
 * `triduum` is the Catholic Paschal Triduum (Nagycsütörtök–Nagyszombat);
 * for the Protestant family `solemnity` means a főünnep (Karácsony, Nagypéntek,
 * Húsvét, Pünkösd).
 */
export type LiturgicalRank = "triduum" | "solemnity" | "feast" | "memorial" | "sunday" | "weekday";

export interface LiturgicalDay {
  date: IsoDate;
  family: LiturgicalFamily;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: IsoWeekday;
  isSunday: boolean;
  /**
   * Hungarian name of what is celebrated on this day after precedence rules,
   * e.g. „Évközi 33. vasárnap”, „Nagyboldogasszony (Szűz Mária mennybevétele)”,
   * „Hamvazószerda”. `null` for an ordinary weekday with nothing to name.
   */
  name: string | null;
  /**
   * For Sundays: the Sunday's name in the temporal cycle, even when a saint's
   * solemnity or a feast takes precedence (e.g. `name` „Mindenszentek”,
   * `sundayName` „Évközi 31. vasárnap”). `null` on weekdays.
   */
  sundayName: string | null;
  /** Stable, language-neutral identifier of the celebration (e.g. `"easterSunday"`), or `null`. */
  key: string | null;
  season: LiturgicalSeason;
  /** Hungarian name of the season, e.g. „Évközi idő”, „Szentháromság ünnepe utáni idő”. */
  seasonName: string;
  /**
   * Week within the season (Catholic: Advent 1–4, Nagyböjt 1–6, Húsvét 1–7,
   * Évközi 1–34; Protestant: the ordinal of the most recent named Sunday, e.g.
   * 23 for the week after „Szentháromság ünnepe utáni 23. vasárnap”). `null` where
   * no numbering applies (Christmas time, the days after Ash Wednesday, …).
   */
  week: number | null;
  rank: LiturgicalRank;
  isSolemnity: boolean;
  /**
   * True for days worth a heads-up in the schedule: solemnities, feasts,
   * memorials, the Triduum, and special days such as Hamvazószerda,
   * Virágvasárnap, Nagyszombat and Szenteste. False for ordinary Sundays and weekdays.
   */
  isNotable: boolean;
  /** Civil year in which this church year ends (the church year starts on Advent 1). */
  liturgicalYear: number;
  /** Catholic Sunday lectionary cycle (A/B/C); `null` for the Protestant family. */
  lectionaryCycle: "A" | "B" | "C" | null;
  /** Catholic weekday lectionary cycle (I/II); `null` for the Protestant family. */
  weekdayCycle: "I" | "II" | null;
}

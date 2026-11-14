// @churchy/hu — Hungarian formatting library (PRD L-02 … L-08, SDD §5.3, deliverable D-06).
// Pure functions; every date/"now" is passed in explicitly and evaluated in Europe/Budapest.

export type {
  Article,
  CivilDate,
  CivilTime,
  DateInput,
  IsoDate,
  IsoDateTime,
  IsoTime,
  IsoWeekday,
  TimeInput,
} from "./types";

export {
  BUDAPEST_TIME_ZONE,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  WEEKDAY_NAMES,
  addDays,
  budapestWallClock,
  daysBetween,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  formatMonthDay,
  formatRelativeDay,
  formatWeekRange,
  isoWeekday,
  monthName,
  parseIsoDate,
  parseIsoTime,
  startOfIsoWeek,
  toCivilDate,
  toInstant,
  toIsoDate,
  toIsoDateString,
  todayInBudapest,
  weekdayName,
  weekdayNames,
} from "./date";
export type { CapitalizeOptions, MonthDayOptions, RelativeDayOptions } from "./date";

export { formatTime, formatTimeRange, toCivilTime } from "./time";
export type { TimeOptions } from "./time";

export { formatPersonName } from "./name";
export type { PersonName, PersonNameOptions } from "./name";

export { formatAddress } from "./address";
export type { Address } from "./address";

export { formatPhone, isValidPhone, normalizePhone, parsePhone, phoneToE164 } from "./phone";
export type { PhoneKind, PhoneParts } from "./phone";

export {
  bankAccountToIban,
  formatBankAccount,
  formatIban,
  ibanToBankAccount,
  isValidBankAccount,
  isValidIban,
  normalizeBankAccount,
} from "./bank";

export { slugify } from "./slug";

export { article, leadingNumberWord, withArticle } from "./article";
export type { WithArticleOptions } from "./article";

export { compareHu, sortHu } from "./collation";

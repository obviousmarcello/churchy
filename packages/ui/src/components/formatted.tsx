import type { HTMLAttributes } from "react";
import {
  bankAccountToIban,
  formatAddress,
  formatBankAccount,
  formatDateLong,
  formatDateShort,
  formatIban,
  formatMonthDay,
  formatPersonName,
  formatPhone,
  formatRelativeDay,
  formatTime,
  formatTimeRange,
  formatWeekRange,
  phoneToE164,
  toCivilTime,
  toIsoDateString,
  type Address as AddressParts,
  type DateInput,
  type IsoDateTime,
  type PersonName as PersonNameParts,
  type TimeInput,
  type TimeOptions,
} from "@churchy/hu";
import { cn } from "../cn";

/**
 * Display components for Hungarian data (PRD L-02 … L-06). They only call `@churchy/hu`: no
 * strings of their own, no locale or time-zone logic. Instants are shown in Europe/Budapest.
 * Invalid input throws (`RangeError`), as the underlying functions do.
 */

type SpanProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">;

export type FormattedDateStyle = "long" | "short" | "monthDay" | "monthDayLong" | "weekRange";

export type FormattedDateProps = SpanProps &
  (
    | {
        /** `long`: `2026. november 12., csütörtök` · `short`: `2026. 11. 12.` ·
         * `monthDay`: `nov. 15.` · `monthDayLong`: `november 15.` · `weekRange`: `nov. 9–15.`
         * (the Monday-first week containing the date). */
        format?: FormattedDateStyle;
        value: DateInput;
        now?: never;
        lowercase?: never;
      }
    | {
        /** `Ma`, `Holnap`, `Tegnap`, otherwise `Szombat, nov. 14.`. */
        format: "relative";
        value: DateInput;
        /** The current instant, passed explicitly (never read from the clock here). */
        now: IsoDateTime | Date;
        /** Lower-case the label for use inside a sentence. */
        lowercase?: boolean;
      }
  );

/** A date as `<time>`, in the requested Hungarian format. */
export function FormattedDate({
  format = "long",
  value,
  now,
  lowercase,
  ...rest
}: FormattedDateProps) {
  let text: string;
  switch (format) {
    case "short":
      text = formatDateShort(value);
      break;
    case "monthDay":
      text = formatMonthDay(value);
      break;
    case "monthDayLong":
      text = formatMonthDay(value, { style: "long" });
      break;
    case "weekRange":
      text = formatWeekRange(value);
      break;
    case "relative":
      text = formatRelativeDay(value, now as IsoDateTime | Date, { lowercase });
      break;
    default:
      text = formatDateLong(value);
  }
  return (
    <time dateTime={toIsoDateString(value)} {...rest}>
      {text}
    </time>
  );
}

export type FormattedTimeProps = SpanProps &
  TimeOptions & {
    value: TimeInput;
    /** End of a time range: `18:00–19:30`. */
    end?: TimeInput;
  };

const clock = (input: TimeInput): string => {
  const { hour, minute } = toCivilTime(input);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

/** A time of day (`18:00`, or spoken `18 óra`) or a range, as `<time>`. */
export function FormattedTime({ value, end, style, ...rest }: FormattedTimeProps) {
  const text = end !== undefined ? formatTimeRange(value, end) : formatTime(value, { style });
  return (
    <time dateTime={clock(value)} {...rest}>
      {text}
    </time>
  );
}

export type PersonNameProps = SpanProps & {
  name: PersonNameParts;
  /** Include prefix and suffix. Default `true`. */
  titles?: boolean;
};

/** Family-name-first personal name; the parts are never inflected. */
export function PersonName({ name, titles, ...rest }: PersonNameProps) {
  return <span {...rest}>{formatPersonName(name, { titles })}</span>;
}

export type AddressProps = SpanProps & { address: AddressParts };

/** `1011 Budapest, Fő utca 1.` */
export function Address({ address, ...rest }: AddressProps) {
  return <span {...rest}>{formatAddress(address)}</span>;
}

export type PhoneProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  value: string;
  /** Render a `tel:` link. Numbers that cannot be dialled as +36 are never linked. */
  link?: boolean;
};

/** `+36 30 123 4567`; foreign numbers are shown as entered. */
export function Phone({ value, link = false, className, ...rest }: PhoneProps) {
  const text = formatPhone(value);
  const e164 = link ? phoneToE164(value) : null;
  if (e164) {
    return (
      <a href={`tel:${e164}`} className={cn("whitespace-nowrap", className)} {...rest}>
        {text}
      </a>
    );
  }
  return (
    <span className={cn("whitespace-nowrap", className)} {...rest}>
      {text}
    </span>
  );
}

export type BankAccountProps = SpanProps & {
  value: string;
  /** `giro` (default): `11773016-11111018-00000000`; `iban`: `HU42 1177 3016 …`. */
  format?: "giro" | "iban";
};

/** Hungarian bank account number (8-8-8 / 8-8), or its IBAN. */
export function BankAccount({ value, format = "giro", className, ...rest }: BankAccountProps) {
  const text =
    format === "iban"
      ? (formatIban(value) ?? bankAccountToIban(value) ?? value.trim())
      : formatBankAccount(value);
  return (
    <span
      className={cn("tabular-nums", format === "giro" && "whitespace-nowrap", className)}
      {...rest}
    >
      {text}
    </span>
  );
}

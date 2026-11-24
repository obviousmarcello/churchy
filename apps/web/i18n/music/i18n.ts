import type { Messages, Plural } from "./messages";

// Music Sheet DB's i18n object (src/i18n/i18n.ts), Hungarian only (PLAN §11 "Language"). `m` is
// the `music` namespace of messages/hu.json as next-intl loaded it for the request; `format()`
// fills the music app's `{name}` placeholders. Server Components get it from `getI18n()`, Server
// Actions and models from `getRequestI18n()` (`./server`), Client Components from `useI18n()`.

export type Locale = "hu";

export type Values = Record<string, string | number>;

export type I18n = {
  locale: Locale;
  /** The messages, e.g. `m.common.nav.songs`. */
  m: Messages;
  /** Puts the values into the `{name}` placeholders. Numbers get the number format of the language. */
  format: (message: string, values?: Values) => string;
  /** Picks the form for `count` and puts it into `{count}`, with the other values. */
  plural: (message: Plural, count: number, values?: Values) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** A date or time in the time zone of the server (Europe/Budapest). */
  dateTime: (value: Date | string | number, options: Intl.DateTimeFormatOptions) => string;
  /** For example "A, B és C". */
  list: (items: string[], type?: Intl.ListFormatType) => string;
  /** Compares texts in Hungarian alphabetical order, for sorts. */
  compare: (a: string, b: string) => number;
  /** For example "45 perc", "2 óra" or "1 óra 30 perc". */
  duration: (minutes: number) => string;
};

/**
 * A text that is translated later, when the language is known. Models use it for error
 * messages, because they do not know the language of the caller.
 */
export type Text = (i18n: I18n) => string;

const cache = new WeakMap<Messages, I18n>();

export function createI18n(m: Messages): I18n {
  const cached = cache.get(m);
  if (cached) return cached;

  const locale: Locale = "hu";
  const numberFormat = new Intl.NumberFormat(locale);
  const pluralRules = new Intl.PluralRules(locale);
  const collator = new Intl.Collator(locale);
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
  const listFormats = new Map<string, Intl.ListFormat>();

  const format = (raw: string, values?: Values) => {
    // ICU quotes around literal braces (`'{'`) keep the catalog valid ICU; the text has none.
    const message = raw.replace(/'([{}])'/g, "$1");
    return values
      ? message.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
          const value = values[name];
          if (value === undefined) return placeholder;
          return typeof value === "number" ? numberFormat.format(value) : value;
        })
      : message;
  };

  const i18n: I18n = {
    locale,
    m,
    format,
    plural: (message, count, values) =>
      format(pluralRules.select(count) === "one" ? message.one : message.other, {
        ...values,
        count,
      }),
    number: (value, options) => {
      if (!options) return numberFormat.format(value);
      const key = JSON.stringify(options);
      let withOptions = numberFormats.get(key);
      if (!withOptions)
        numberFormats.set(key, (withOptions = new Intl.NumberFormat(locale, options)));
      return withOptions.format(value);
    },
    dateTime: (value, options) => {
      const key = JSON.stringify(options);
      let dateTimeFormat = dateTimeFormats.get(key);
      if (!dateTimeFormat) {
        dateTimeFormats.set(
          key,
          (dateTimeFormat = new Intl.DateTimeFormat(locale, {
            timeZone: "Europe/Budapest",
            ...options,
          })),
        );
      }
      return dateTimeFormat.format(new Date(value));
    },
    list: (items, type = "conjunction") => {
      let listFormat = listFormats.get(type);
      if (!listFormat) listFormats.set(type, (listFormat = new Intl.ListFormat(locale, { type })));
      return listFormat.format(items);
    },
    compare: (a, b) => collator.compare(a, b),
    duration: (minutes) => {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      if (hours === 0) return format(m.common.duration.minutes, { minutes: rest });
      if (rest === 0) return format(m.common.duration.hours, { hours });
      return format(m.common.duration.hoursMinutes, { hours, minutes: rest });
    },
  };

  cache.set(m, i18n);
  return i18n;
}

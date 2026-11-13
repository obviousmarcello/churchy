# @churchy/hu

Hungarian presentation for every screen (PRD L-02 … L-08, SDD §5.3). Pure TypeScript, no runtime dependencies, never mocked.

```ts
import { formatDateLong, formatPhone, withArticle, sortHu } from "@churchy/hu";
```

## Conventions

- Civil dates are `"YYYY-MM-DD"` (`IsoDate`), times `"HH:mm"` (`IsoTime`), instants ISO-8601 **with offset** (`IsoDateTime`). `Date` objects are accepted wherever a date or time is.
- Instants are always shown in **Europe/Budapest**. The process time zone is never read: nothing here calls `new Date()` without arguments, parses offset-less date-times (they throw `RangeError`) or uses local-time `Date` getters. "Now" is always an argument.
- ISO weekday: 1 = Monday … 7 = Sunday. Weeks start on Monday.
- Invalid input to the date/time functions throws `RangeError`. Phone, bank-account and IBAN helpers return `null` for invalid input (`normalize*`), or hand the input back trimmed (`format*`).
- Month and weekday names are built in (not read from ICU) so output cannot change with the Node/ICU version; a test cross-checks them against ICU. Only collation uses `Intl.Collator('hu')`.

## Dates and times

```ts
formatDateLong("2026-11-12"); // "2026. november 12., csütörtök"
formatDateShort("2026-11-12"); // "2026. 11. 12."
formatMonthDay("2026-11-15"); // "nov. 15."
formatMonthDay("2026-11-15", { style: "long" }); // "november 15."
weekdayName(1); // "hétfő"
weekdayName("2026-11-14", { capitalize: true }); // "Szombat"
weekdayNames({ capitalize: true }); // ["Hétfő", …, "Vasárnap"]

const now = "2026-11-12T10:00:00+01:00";
formatRelativeDay("2026-11-12", now); // "Ma"
formatRelativeDay("2026-11-13", now); // "Holnap"
formatRelativeDay("2026-11-11", now); // "Tegnap"
formatRelativeDay("2026-11-14", now); // "Szombat, nov. 14."

formatWeekRange("2026-11-12"); // "nov. 9–15."          (Monday-first week containing the date)
formatWeekRange("2026-12-02"); // "nov. 30. – dec. 6."
formatWeekRange("2027-01-01"); // "2026. dec. 28. – 2027. jan. 3."
formatDateRange("2026-11-15", "2026-11-16"); // "nov. 15–16."

formatTime("18:00"); // "18:00"
formatTime("18:30", { style: "spoken" }); // "18 óra 30 perc"
formatTime("2026-03-29T01:00:00Z"); // "03:00"  (Budapest has just switched to summer time)
formatTimeRange("18:00", "19:30"); // "18:00–19:30"
```

Helpers: `toCivilDate`, `todayInBudapest(now)`, `isoWeekday`, `addDays`, `daysBetween`, `startOfIsoWeek`, `parseIsoDate`, `parseIsoTime`, `toInstant`, `monthName`.

## Names, addresses, phones, bank accounts

```ts
formatPersonName({ prefix: "dr.", familyName: "Kovács", givenName: "János" }); // "dr. Kovács János"
formatPersonName({ prefix: "P.", familyName: "Nagy", givenName: "Tamás", suffix: "OSB" }); // "P. Nagy Tamás OSB"
formatPersonName(name, { titles: false }); // sort key without prefix/suffix

formatAddress({ postalCode: "1011", city: "Budapest", street: "Fő utca", houseNumber: "1" });
// "1011 Budapest, Fő utca 1."

normalizePhone("06 30 1234567"); // "+36 30 123 4567"   (mobile: 20/30/31/50/70)
normalizePhone("+3612345678"); // "+36 1 234 5678"    (Budapest)
normalizePhone("06-22/123-456"); // "+36 22 123 456"    (other area codes, 6-digit subscriber)
normalizePhone("+44 20 7946 0958"); // null
formatPhone("+44 20 7946 0958"); // "+44 20 7946 0958" (shown as entered)
phoneToE164("06 30 123 4567"); // "+36301234567" (for tel: links)

normalizeBankAccount("117730161111101800000000"); // "11773016-11111018-00000000"
normalizeBankAccount("11773016 11111018"); // "11773016-11111018"
bankAccountToIban("11773016-11111018-00000000"); // "HU42 1177 3016 1111 1018 0000 0000"
ibanToBankAccount("HU42 1177 3016 1111 1018 0000 0000"); // "11773016-11111018-00000000"
```

## Slugs

```ts
slugify("Történetünk"); // "tortenetunk"
slugify("Ünnepi miserend"); // "unnepi-miserend"
slugify("Őrangyalok ŰR"); // "orangyalok-ur"
```

## Article _a/az_

The article follows the **spoken** form. Words are decided by their first letter; numbers by the first word with which the number is spoken (`leadingNumberWord`).

```ts
article("egyház"); // "az"
article("1"); // "az"  egy
article("5"); // "az"  öt
article("10"); // "a"   tíz
article("50"); // "az"  ötven
article("100"); // "a"   száz
article("1000"); // "az"  ezer
article("5000"); // "az"  ötezer
article("2026"); // "a"   kétezer-huszonhat
article("1956"); // "az"  ezerkilencszázötvenhat
article("1 000 000"); // "az"  egymillió
article("5."); // "az"  ötödik
article("10."); // "a"   tizedik

withArticle("5. vasárnap"); // "az 5. vasárnap"
withArticle("10 órai mise"); // "a 10 órai mise"
withArticle("miserend", { capitalize: true }); // "A miserend"
```

Limitation: acronyms spelled out letter by letter (_az MNB_, "emenbé") are not detected.

## Collation

```ts
compareHu("cukor", "csiga"); // < 0
sortHu(["zsolt", "zita", "csaba", "cecília"]); // ["cecília", "csaba", "zita", "zsolt"]
sortHu(people, (p) => p.name); // stable, returns a new array
```

What Node's ICU (`Intl.Collator('hu')`) does, verified in `src/collation.test.ts`:

- Digraphs/trigraph are single letters: `c < cs < d`, `d < dz < dzs < e`, `g < gy < h`, `l < ly < m`, `n < ny < o`, `s < sz < t`, `t < ty < u`, `z < zs`. A digraph is compared as one letter, so `gz < gy`, `sa < sz` and `cza < csa`.
- Doubled digraphs (`ccs`, `ggy`, `ssz`) get the primary weights of `cscs`, `gygy`, `szsz`.
- Long and short vowels share a primary weight (`o = ó`, `ö = ő`, `u = ú`, `ü = ű`) and are ordered short before long on the secondary level; `o/ó < ö/ő < u/ú < ü/ű`. So `oa < óa < ob < öa < őa`, and `ökör < őr < ördög`.
- Lower case sorts before upper case when the letters are otherwise equal.

## Tests

`pnpm --filter @churchy/hu test` (runs under `TZ=Europe/Budapest`) and `test:coverage` (≥ 95 % thresholds). `src/timezone.test.ts` re-checks DST-sensitive instants after switching `process.env.TZ` in-process and re-runs the whole suite in child Vitest processes with `TZ=UTC`, `America/Los_Angeles` and `Pacific/Kiritimati`.

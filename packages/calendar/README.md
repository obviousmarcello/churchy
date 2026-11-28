# @churchy/calendar

Pure, timezone-independent church-year logic for Hungary (SDD §9.2, PRD L-10):
Western Easter, moveable feasts, Hungarian public holidays, and Catholic /
Protestant liturgical day names. Never mocked; used by both data adapters and by
the schedule engine (`packages/schedule`).

## Conventions

- Dates are civil ISO strings, `IsoDate = "YYYY-MM-DD"`. All arithmetic is integer
  arithmetic on the proleptic Gregorian calendar — no `Date` object is created, so
  results never depend on the server timezone (`timezone.test.ts` checks this under
  several `TZ` values and guards the sources against `Date` use).
- ISO weekdays: 1 = Monday … 7 = Sunday.
- Supported years: 1583–9999 (tested exhaustively for 1900–2100). Invalid input
  throws `RangeError`.
- No runtime dependencies; does not import other `@churchy` packages.

## Stable API for the schedule engine

These two signatures are consumed through an injected callback and must stay stable:

```ts
liturgicalDay(date: IsoDate, family: LiturgicalFamily): LiturgicalDay
publicHoliday(date: IsoDate): PublicHoliday | null
```

```ts
type LiturgicalFamily = "catholic" | "protestant";

interface LiturgicalDay {
  date: IsoDate;
  family: LiturgicalFamily;
  weekday: IsoWeekday; // 1 = Monday … 7 = Sunday
  isSunday: boolean;
  name: string | null; // what is celebrated (after precedence); null on a plain weekday
  sundayName: string | null; // the Sunday's temporal name, even when a saint's day displaces it
  key: string | null; // stable id: "easterSunday", "christTheKing", "ordinary-33", "trinity-23" …
  season: LiturgicalSeason;
  seasonName: string; // „Évközi idő”, „Szentháromság ünnepe utáni idő” …
  week: number | null;
  rank: "triduum" | "solemnity" | "feast" | "memorial" | "sunday" | "weekday";
  isSolemnity: boolean;
  isNotable: boolean; // solemnities, feasts, memorials, Triduum, Hamvazószerda, Virágvasárnap, Szenteste …
  liturgicalYear: number; // civil year in which the church year ends (starts on Advent 1)
  lectionaryCycle: "A" | "B" | "C" | null; // catholic only
  weekdayCycle: "I" | "II" | null; // catholic only
}

interface PublicHoliday {
  date: IsoDate;
  key: PublicHolidayKey; // "newYear", "revolution1848", "goodFriday", …
  name: string; // „Nemzeti ünnep”
  moveable: boolean;
}
```

Mapping presets to families (done by the caller): Római katolikus and Görögkatolikus →
`catholic` (Greek Catholics in Hungary use the Gregorian Easter; a Byzantine naming
scheme is not implemented yet); Református, Evangélikus, Baptista / szabadegyházi,
Unitárius, Általános keresztény → `protestant`.

## Other exports

| Function                                               | Returns                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `easter(year)`                                         | Easter Sunday (anonymous Gregorian / Meeus–Jones–Butcher algorithm)                 |
| `moveableFeasts(year)`                                 | `MoveableFeasts`: Hamvazószerda … Úrnapja, Jézus Szíve, Krisztus Király, Advent 1–4 |
| `firstSundayOfAdvent(year)`                            | Advent 1 of that December                                                           |
| `publicHolidays(year)`                                 | all public holidays of a year, sorted                                               |
| `sundayName(date, family)`                             | `liturgicalDay(date, family).sundayName`                                            |
| `feastsInRange(from, to, family)`                      | notable days (`isNotable`) in `[from, to]`, max 800 days                            |
| `addDays`, `daysBetween`, `isoWeekday`, `parseIsoDate` | civil-date helpers                                                                  |

## Moveable days

Relative to Easter (E): Hamvazószerda E−46, Virágvasárnap E−7, Nagycsütörtök E−3,
Nagypéntek E−2, Nagyszombat E−1, Húsvéthétfő E+1, Áldozócsütörtök E+39 (kept on
Thursday in Hungary), Pünkösdvasárnap E+49, Pünkösdhétfő E+50, Szentháromság
vasárnapja E+56, Jézus Szentséges Szíve E+68. Advent 4 is the last Sunday on or before
Dec 24; Advent 1 is three weeks earlier; Krisztus Király is the Sunday before Advent 1.

**Úrnapja = E+63, the Sunday after Trinity.** The universal date is the Thursday after
Trinity (E+60), but in Hungary the solemnity is transferred to the following Sunday
(it is not a public holiday), and that is when parishes hold the Úrnapja procession
and when the schedule needs it.

## Hungarian public holidays

Per the Labour Code (2012. évi I. törvény 102. § (1)): jan. 1. Újév, márc. 15. Nemzeti
ünnep, Nagypéntek, Húsvéthétfő, máj. 1. A munka ünnepe, Pünkösdhétfő, aug. 20.
Államalapítás ünnepe, okt. 23. Nemzeti ünnep, nov. 1. Mindenszentek, dec. 24.
Szenteste, dec. 25. Karácsony, dec. 26. Karácsony másnapja.

- Easter Sunday and Pentecost Sunday are not returned (they are Sundays anyway).
- Only the two most recent changes are modelled: Nagypéntek from **2017**, Szenteste
  from **2026** (adopted by Parliament on 2026-11-03). Earlier historical changes
  (e.g. nov. 1. from 2000) are not modelled — results before 2000 list today's set.
- Swapped working days (áthelyezett munkanapok) are out of scope (later issue).

## Catholic family

General Roman Calendar temporal cycle plus the solemnities and feasts of the Lord, and
the Hungarian proper solemnities (aug. 20. Szent István király, okt. 8. Magyarok
Nagyasszonya). Memorials of saints are not included.

- Sundays: „Advent N. vasárnapja”, „Karácsony utáni 2. vasárnap”, „Évközi N. vasárnap”,
  „Nagyböjt N. vasárnapja” (1–5), „Virágvasárnap”, „Húsvét N. vasárnapja” (2–7).
- Ordinary Time: the week after Urunk megkeresztelkedése is week 1 (so the next Sunday
  is „Évközi 2. vasárnap”); after Pentecost the numbering resumes so that the last
  Sunday before Advent is week 34 (Krisztus Király). Formula: `35 − (Advent 1 − Sunday) / 7`.
- Vízkereszt is kept on Jan 6 (Hungary); Urunk megkeresztelkedése is the Sunday after.
- Szent Család: Sunday within the Christmas octave, else Dec 30.
- Precedence follows the Table of Liturgical Days (Triduum > principal feasts and Advent/
  Lent/Easter Sundays > solemnities > proper solemnities > feasts of the Lord > other
  Sundays > feasts of saints > weekdays). A solemnity or feast of the Lord falling on an
  Ordinary Time Sunday replaces it; `sundayName` keeps „Évközi N. vasárnap”.
- Transfers: Szent József in Holy Week → Saturday before Virágvasárnap, on a Lent Sunday
  → Monday; Gyümölcsoltó Boldogasszony in Holy Week/Easter octave → Monday after Húsvét 2. vasárnapja, on a Lent Sunday → Monday; Szeplőtelen fogantatás on a Sunday → Dec 9;
  Keresztelő Szent János / Szent Péter és Pál coinciding with Jézus Szíve or Úrnapja →
  previous day (precedent: 2022-06-23).
- Lectionary cycle: liturgical year ending in 2026 = A (Advent 2025), 2027 = B; weekday
  cycle I in odd, II in even years.

## Protestant family (Hungarian Lutheran/Reformed church year)

One consistent, mostly descriptive scheme:

| Period             | Sunday names                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Advent             | Advent 1.–4. vasárnapja                                                                                                                         |
| Christmas          | Karácsony ünnepe (dec. 25.), Karácsony 2. napja (dec. 26.), Karácsony utáni vasárnap, Újév, Újév utáni vasárnap                                 |
| Epiphany           | Vízkereszt ünnepe (jan. 6.), Vízkereszt utáni N. vasárnap                                                                                       |
| Böjtelő            | Hetvened vasárnap (Septuagesimae), Hatvanad vasárnap (Sexagesimae), Ötvened vasárnap (Esto mihi)                                                |
| Lent               | Hamvazószerda, Böjt 1.–5. vasárnapja (Invocavit, Reminiscere, Oculi, Laetare, Judica), Virágvasárnap (Palmarum)                                 |
| Holy Week, Easter  | Nagycsütörtök, Nagypéntek, Nagyszombat, Húsvétvasárnap, Húsvéthétfő                                                                             |
| Easter time        | Húsvét utáni 1.–6. vasárnap (Quasimodogeniti, Misericordias Domini, Jubilate, Cantate, Rogate, Exaudi), Mennybemenetel ünnepe (Áldozócsütörtök) |
| Pentecost, Trinity | Pünkösdvasárnap, Pünkösdhétfő, Szentháromság ünnepe, Szentháromság ünnepe utáni N. vasárnap (1–27)                                              |
| Other              | Reformáció ünnepe (okt. 31.), Szenteste (dec. 24.)                                                                                              |

Főünnepek (`solemnity`): Karácsony ünnepe, Nagypéntek, Húsvétvasárnap, Pünkösdvasárnap.

## Open questions for the pilot clergy

- Catholic: exact display names of Krisztus Király (vs. „Krisztus, a mindenség Királya”),
  Karácsony („Karácsony, Urunk születése”), Pünkösdhétfő (Mária, az Egyház Anyja
  memorial), Halottak napja rank, okt. 8. as a Sunday-displacing solemnity.
- Protestant: „Karácsony 2. napja” vs. „Karácsony másodnapja”; „Újév utáni vasárnap”;
  the böjtelő names; whether the last Sundays after Epiphany / after Trinity should get
  special names (e.g. „Az egyházi év utolsó vasárnapja”); whether Reformed churches
  want the Latin Sunday names at all. Names are in code constants and easy to change.

## Easter reference table

`src/__fixtures__/easter-1900-2100.json` is generated by
`scripts/generate-easter-reference.py` with Knuth's epact algorithm (a different
derivation from the one in `easter.ts`), cross-checked against python-dateutil for
every year. Regenerate with:

```bash
python3 -I scripts/generate-easter-reference.py src/__fixtures__/easter-1900-2100.json
```

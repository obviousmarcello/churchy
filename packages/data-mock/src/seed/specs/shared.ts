/** Helpers shared by the three church specs (structure only — all wording stays in the specs). */
import type { FormField, HomeSection, NavItem } from "@churchy/contracts";
import { fArea, fCheck, fDate, fEmail, fFile, fPhone, fSelect, fText } from "../fields";
import type { FormSpec, HrCategorySpec, PageSpec } from "../types";

export const nav = (
  label: string,
  href: string,
  children: [label: string, href: string][] = [],
): NavItem => ({
  label,
  href,
  external: false,
  children: children.map(([l, h]) => ({ label: l, href: h, external: false })),
});

export const section = (
  id: string,
  type: HomeSection["type"],
  settings: Record<string, unknown> = {},
): HomeSection => ({
  id,
  type,
  settings,
});

export const STANDARD_HOME: HomeSection[] = [
  section("home-hero", "hero"),
  section("home-next", "nextServices"),
  section("home-announcements", "announcements"),
  section("home-news", "news", { count: 3 }),
  section("home-events", "events", { count: 4 }),
  section("home-map", "map"),
];

/** Rite request form: common contact fields plus rite-specific ones. */
export function riteForm(
  key: string,
  title: string,
  prefix: string,
  extra: FormField[],
  confirmation: string,
  retentionDays = 730,
): FormSpec {
  return {
    key,
    title,
    prefix,
    fields: [
      fText("contactName", "Kapcsolattartó neve", true),
      fEmail("email", "E-mail-cím", true),
      fPhone("phone", "Telefonszám", true),
      ...extra,
      fDate(
        "preferredDate",
        "Kívánt időpont",
        false,
        "Tájékoztató jellegű, az időpontot egyeztetjük.",
      ),
      fArea("message", "Megjegyzés"),
    ],
    confirmation,
    retentionDays,
  };
}

/** Rite information page (FR-010): when and how, documents, preparation, call to action. */
export function ritePage(opts: {
  slug: string;
  title: string;
  rite: string;
  parent: string;
  sort: number;
  intro: string[];
  steps: string[];
  documents: string[];
  preparation: string[];
  cta: string;
  description: string;
  texts: { when: string; documents: string; preparation: string };
}): PageSpec {
  return {
    slug: opts.slug,
    title: opts.title,
    parent: opts.parent,
    rite: opts.rite,
    sort: opts.sort,
    description: opts.description,
    blocks: [
      { type: "text", paragraphs: opts.intro },
      { type: "heading", text: opts.texts.when },
      { type: "text", paragraphs: [], bullets: opts.steps },
      { type: "heading", text: opts.texts.documents },
      { type: "text", paragraphs: [], bullets: opts.documents },
      { type: "heading", text: opts.texts.preparation },
      { type: "text", paragraphs: opts.preparation },
      { type: "cta", label: opts.cta, href: `/szertartasok/${opts.slug}/bejelentes` },
    ],
  };
}

/**
 * The HR category set of every demo church (SDD §25.2). `hr` is the person key of the HR
 * handler, `conf` of the confidential-matters handler.
 */
export function hrCategories(hr: string, conf: string): HrCategorySpec[] {
  const range = (): FormField[] => [
    fDate("from", "Első nap", true),
    fDate("to", "Utolsó nap", true),
  ];
  return [
    {
      key: "szabadsag",
      name: "Szabadságkérelem",
      fields: [...range(), fArea("note", "Megjegyzés (nem kötelező)")],
      whoCanSubmit: "employees",
      handlers: [hr],
      chain: ["manager", "leader"],
      slaHours: 72,
      absenceType: "rendes_szabadsag",
    },
    {
      key: "betegszabadsag",
      name: "Betegszabadság-bejelentés",
      fields: [
        ...range(),
        fArea(
          "note",
          "Megjegyzés",
          false,
          "Kérjük, ne adjon meg egészségügyi részleteket — elég a távollét ténye.",
        ),
      ],
      whoCanSubmit: "employees",
      handlers: [hr],
      chain: [],
      slaHours: 24,
      absenceType: "betegszabadsag",
    },
    {
      key: "egyeb-tavollet",
      name: "Egyéb távollét (tanulmányi, fizetés nélküli)",
      fields: [...range(), fText("reason", "A távollét jellege", true)],
      whoCanSubmit: "employees",
      handlers: [hr],
      chain: ["manager", "leader"],
      slaHours: 120,
      absenceType: "egyeb_tavollet",
    },
    {
      key: "koltsegterites",
      name: "Költségtérítés-igény",
      fields: [
        fText("amount", "Összeg (Ft)", true),
        fDate("date", "A költség időpontja", true),
        fArea("description", "Mire költötte?", true),
        fFile("receipt", "Számla vagy bizonylat"),
      ],
      whoCanSubmit: "all",
      handlers: [hr],
      chain: ["manager", "hrHandler"],
      slaHours: 168,
    },
    {
      key: "eszkozigeny",
      name: "Eszköz- vagy kulcsigény",
      fields: [
        fSelect(
          "item",
          "Mire van szüksége?",
          [
            ["kulcs", "Kulcs"],
            ["laptop", "Laptop vagy tablet"],
            ["telefon", "Szolgálati telefon"],
            ["egyeb", "Egyéb"],
          ],
          true,
        ),
        fArea("note", "Indoklás"),
      ],
      whoCanSubmit: "all",
      handlers: [hr],
      chain: ["manager"],
      slaHours: 96,
    },
    {
      key: "onkentes-szolgalat",
      name: "Önkéntes szolgálat — jelentkezés és adatmódosítás",
      fields: [
        fText("service", "Milyen szolgálatra jelentkezik?", true),
        fCheck("contract", "Elolvastam és elfogadom az önkéntes szolgálati megállapodást", true),
      ],
      whoCanSubmit: "volunteers",
      handlers: [hr],
      chain: [],
      slaHours: 120,
    },
    {
      key: "munkaugyi-kerdes",
      name: "Munkaügyi kérdés",
      fields: [fText("topic", "Téma", true), fArea("question", "Kérdése", true)],
      whoCanSubmit: "employees",
      handlers: [hr],
      chain: [],
      slaHours: 96,
    },
    {
      key: "bizalmas-bejelentes",
      name: "Bizalmas bejelentés",
      fields: [fArea("description", "A bejelentés tárgya", true)],
      whoCanSubmit: "all",
      handlers: [conf],
      chain: [],
      slaHours: 48,
      confidential: true,
      allowAnonymous: true,
      retentionDays: 5 * 365,
    },
    {
      key: "nevtelen-visszajelzes",
      name: "Névtelen visszajelzés",
      fields: [fArea("feedback", "Visszajelzése", true)],
      whoCanSubmit: "all",
      handlers: [hr],
      chain: [],
      slaHours: null,
      allowAnonymous: true,
    },
  ];
}

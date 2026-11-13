import type { Denomination, TermForms } from "@churchy/contracts";
import { effectiveConfig } from "./config";
import { DENOMINATIONS, PRESETS } from "./presets";
import { TERM_KEYS, type Preset, type ReviewStatus, type TermKey } from "./schema";

/** What each term key means, for reviewers who do not read code. */
const TERM_CONCEPTS: Record<TermKey, string> = {
  community: "the local church (parish / congregation)",
  service: "the main worship service",
  serviceSchedule: "the weekly service schedule page",
  leadClergy: "the leading minister / priest",
  office: "the parish / church office",
  sermon: "the sermon / homily",
  layCouncil: "the lay council",
  support: "the regular church contribution",
  worshipTeam: "music ministry / choir",
  musicPlan: "the music / worship plan of a service",
  serviceRota: "the duty rota (readers, servers, collection …)",
  homePage: "home page",
  announcementsSection: "weekly announcements page",
  newsSection: "news page",
  eventsSection: "events page",
  locationsSection: "churches / locations page",
  staffSection: "clergy & staff page",
  groupsSection: "groups & ministries page",
  ritesSection: "rites section (baptism, wedding, funeral … pages)",
  sermonsSection: "sermons / media page",
  livestreamSection: "livestream page",
  gallerySection: "gallery page",
  documentsSection: "documents page",
  givingSection: "support / giving page",
  aboutPage: "about us page",
  contactPage: "contact page",
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  reviewed: "reviewed",
  "pending-review": "awaiting pilot-clergy sign-off",
  beta: "*béta* (no pilot reviewer yet)",
};

/** Calendar names the pilot clergy are asked to confirm (from `packages/calendar`). */
export const LITURGICAL_NAMES_TO_CONFIRM = {
  catholic: [
    "„Krisztus Király” vs. „Krisztus, a mindenség Királya”",
    "„Karácsony, Urunk születése” as the name of Christmas Day",
    "Pünkösdhétfő: show the memorial „Mária, az Egyház Anyja”?",
    "Rank of Halottak napja (nov. 2.)",
    "okt. 8. Magyarok Nagyasszonya: a solemnity that displaces the Sunday?",
    "Húsvét 2. vasárnapja without the name „Isteni irgalmasság vasárnapja”",
    "Szenteste (dec. 24.) as a named weekday",
  ],
  protestant: [
    "„Karácsony 2. napja” vs. „Karácsony másodnapja”",
    "„Karácsony utáni vasárnap” / „Újév utáni vasárnap”",
    "Böjtelő: „Hetvened / Hatvanad / Ötvened vasárnap”",
    "Whether to show the Latin Sunday names (Invocavit, Reminiscere …), especially for Reformed churches",
    "A special name for the last Sunday of the church year (e.g. „Az egyházi év utolsó vasárnapja”)?",
    "Ranks of Nagycsütörtök, Nagypéntek, Mennybemenetel and Szentháromság ünnepe",
  ],
} as const;

const cell = (s: string | undefined) => (s ?? "—").replace(/\|/g, "\\|");
const code = (s: string) => `\`${s}\``;

function table(head: string[], rows: (string | undefined)[][]): string[] {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ];
}

function termRow(key: TermKey, forms: TermForms, fromPreset: boolean): string[] {
  return [
    code(key),
    TERM_CONCEPTS[key],
    `**${forms.nom}**`,
    forms.lower,
    forms.plural ?? "—",
    code(forms.slug),
    forms.article,
    fromPreset ? "preset" : "platform",
  ];
}

function signOffLine(preset: Preset): string {
  if (preset.signOff === null) return "Sign-off: — (pending)";
  const note = preset.signOff.note ? ` — ${preset.signOff.note}` : "";
  return `Sign-off: ${preset.signOff.reviewer}, ${preset.signOff.date}${note}`;
}

function renderPreset(denomination: Denomination): string[] {
  const preset = PRESETS[denomination];
  const config = effectiveConfig({ name: preset.name, denomination });
  const own = new Set(Object.keys(preset.terminology));
  const out: string[] = [
    `## ${preset.name} (${code(preset.key)})`,
    "",
    `- Review status: ${STATUS_LABEL[preset.reviewStatus]}`,
    `- Liturgical calendar: ${code(preset.calendarFamily)}`,
    `- ${signOffLine(preset)}`,
    "",
    "### Terminology",
    "",
    ...table(
      [
        "Key",
        "Concept",
        "Heading form",
        "In a sentence",
        "Plural",
        "URL slug",
        "Article",
        "Source",
      ],
      TERM_KEYS.map((k) => termRow(k, config.terminology[k], own.has(k))),
    ),
    "",
    "### Rites (requestable, FR-010)",
    "",
    ...table(
      ["Rite", "URL slug", "Request reference"],
      preset.rites.map((r) => [
        `**${r.forms.nom}**`,
        code(r.forms.slug),
        code(`${r.referencePrefix}-2026-0001`),
      ]),
    ),
    "",
    "### Service types (FR-002)",
    "",
    ...table(
      ["Service type", "Key", "Plural", "Main (has a plan template)"],
      preset.serviceTypes.map((s) => [
        `**${s.forms.nom}**`,
        code(s.key),
        s.forms.plural,
        s.main ? "yes" : "no",
      ]),
    ),
    "",
    "### Plan templates (FR-802)",
    "",
  ];
  for (const t of preset.planTemplates) {
    out.push(`#### ${t.name} (${code(t.serviceType)})`, "");
    t.items.forEach((item, i) => out.push(`${i + 1}. ${item.title} — _${item.type}_`));
    out.push("");
  }
  out.push(
    "### Rota positions (FR-812)",
    "",
    preset.rotaPositions.map((p) => p.nom).join(", "),
    "",
    "### Default modules",
    "",
    `On: ${Object.entries(config.modules)
      .filter(([, on]) => on)
      .map(([k]) => code(k))
      .join(", ")}`,
    "",
    `Off: ${Object.entries(config.modules)
      .filter(([, on]) => !on)
      .map(([k]) => code(k))
      .join(", ")}`,
    "",
    "### Home page section order",
    "",
    config.home.map((s) => code(s.type)).join(" → "),
    "",
    "### Default navigation",
    "",
  );
  for (const item of config.navigation) {
    out.push(`- ${item.label} (${code(item.href)})`);
    for (const child of item.children) out.push(`  - ${child.label} (${code(child.href)})`);
  }
  out.push("");
  return out;
}

/**
 * Renders `docs/presets-review.md` — the document the pilot clergy review (D-23 AC4).
 * Deterministic; regenerate with `pnpm --filter @churchy/presets review-doc`.
 */
export function renderReviewDoc(): string {
  const lines: string[] = [
    "# Denomination presets — review document",
    "",
    "<!-- Generated by `pnpm --filter @churchy/presets review-doc` from packages/presets. Do not edit by hand: a test fails when this file is stale. -->",
    "",
    "This document lists, for each of the 7 denomination presets (PRD §5), every term, rite, service type and service-plan template a new church starts with. Every value can be overridden by the church (FR-102). The clergy of the pilot churches (Roman Catholic, Reformed, Lutheran, free church) review their preset; a sign-off is recorded in the preset data (`signOff`) and appears below. Presets without a reviewer are shown as *béta* in the setup wizard (D-23 AC4).",
    "",
    "Columns of the terminology tables: *Heading form* is used in headings and navigation, *In a sentence* inside running text, *Article* is the definite article („a” / „az”) before the word. *Source* says whether the value comes from the denomination preset or from the platform defaults shared by all denominations.",
    "",
    "## Overview",
    "",
    ...table(
      ["Preset", "Key", "Review status", "Calendar", "Sign-off"],
      DENOMINATIONS.map((d) => {
        const p = PRESETS[d];
        return [
          p.name,
          code(p.key),
          STATUS_LABEL[p.reviewStatus],
          code(p.calendarFamily),
          p.signOff ? `${p.signOff.reviewer}, ${p.signOff.date}` : "—",
        ];
      }),
    ),
    "",
  ];
  for (const d of DENOMINATIONS) lines.push(...renderPreset(d));
  lines.push(
    "## Liturgical names to confirm",
    "",
    "Names produced by `packages/calendar` that the pilot clergy are asked to confirm.",
    "",
    "### Catholic calendar (Római katolikus, Görögkatolikus)",
    "",
    ...LITURGICAL_NAMES_TO_CONFIRM.catholic.map((s) => `- [ ] ${s}`),
    "",
    "### Protestant calendar (Református, Evangélikus, Baptista / szabadegyházi, Unitárius, Általános keresztény)",
    "",
    ...LITURGICAL_NAMES_TO_CONFIRM.protestant.map((s) => `- [ ] ${s}`),
    "",
  );
  return lines.join("\n");
}

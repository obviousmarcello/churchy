import type { HomeSection, ModuleKey } from "@churchy/contracts";
import { safeHref } from "@churchy/ui";

/**
 * Pure state operations of the home composer (FR-107, D-24): add / remove / reorder sections and
 * edit their settings. The UI keeps a draft list and calls these; the server action re-validates
 * the saved list with `homeProblems()`.
 */

export type HomeSectionType = HomeSection["type"];

/** All section types the composer offers, in the order of the *add* list. */
export const HOME_SECTION_TYPES: readonly HomeSectionType[] = [
  "hero",
  "nextServices",
  "announcements",
  "news",
  "events",
  "livestream",
  "quote",
  "map",
  "cta",
  "customText",
];

/** Types that can appear several times; every other type at most once. */
const REPEATABLE: ReadonlySet<HomeSectionType> = new Set(["quote", "cta", "customText"]);

/** Module a section depends on; sections of disabled modules are not offered (FR-105). */
const SECTION_MODULE: Partial<Record<HomeSectionType, ModuleKey>> = {
  nextServices: "schedule",
  announcements: "announcements",
  news: "news",
  events: "events",
  livestream: "livestream",
};

export function sectionAllowed(
  type: HomeSectionType,
  modules: Partial<Record<ModuleKey, boolean>>,
): boolean {
  const required = SECTION_MODULE[type];
  return required === undefined || modules[required] === true;
}

/** Types that can still be added to `sections`. */
export function addableTypes(
  sections: readonly HomeSection[],
  modules: Partial<Record<ModuleKey, boolean>>,
): HomeSectionType[] {
  return HOME_SECTION_TYPES.filter(
    (type) =>
      sectionAllowed(type, modules) &&
      (REPEATABLE.has(type) || !sections.some((s) => s.type === type)),
  );
}

/** Settings a freshly added section starts with. */
export function defaultSettings(type: HomeSectionType): HomeSection["settings"] {
  switch (type) {
    case "news":
      return { count: 3 };
    case "events":
      return { count: 4 };
    default:
      return {};
  }
}

export function addSection(
  sections: readonly HomeSection[],
  type: HomeSectionType,
  id: string,
): HomeSection[] {
  return [...sections, { id, type, settings: defaultSettings(type) }];
}

export function removeSection(sections: readonly HomeSection[], id: string): HomeSection[] {
  return sections.filter((s) => s.id !== id);
}

/** Moves a section by `delta` places (clamped); an unknown id leaves the list as it is. */
export function moveSection(
  sections: readonly HomeSection[],
  id: string,
  delta: number,
): HomeSection[] {
  const from = sections.findIndex((s) => s.id === id);
  if (from < 0) return [...sections];
  const to = Math.min(Math.max(from + delta, 0), sections.length - 1);
  const next = [...sections];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Sets (or, for `undefined` / empty text, removes) settings of one section. */
export function updateSettings(
  sections: readonly HomeSection[],
  id: string,
  patch: Record<string, unknown>,
): HomeSection[] {
  return sections.map((s) => {
    if (s.id !== id) return s;
    const settings: Record<string, unknown> = { ...s.settings };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") delete settings[key];
      else settings[key] = value;
    }
    return { ...s, settings };
  });
}

/** An id for a new section that is not used yet. */
export function newSectionId(sections: readonly HomeSection[], type: HomeSectionType): string {
  let n = sections.length + 1;
  while (sections.some((s) => s.id === `${type}-${n}`)) n += 1;
  return `${type}-${n}`;
}

export type HomeProblem = "quoteText" | "ctaLabel" | "ctaHref" | "customText" | "count";

const filled = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() !== "" && v.trim().length <= max;

/** What is missing in a section's settings; such a section would not render on the home page. */
export function sectionProblems(section: HomeSection): HomeProblem[] {
  const s = section.settings;
  const problems: HomeProblem[] = [];
  switch (section.type) {
    case "quote":
      if (!filled(s.text, 600)) problems.push("quoteText");
      break;
    case "cta":
      if (!filled(s.label, 60)) problems.push("ctaLabel");
      if (safeHref(s.href) === null) problems.push("ctaHref");
      break;
    case "customText":
      if (!filled(s.text, 4000)) problems.push("customText");
      break;
    case "news":
    case "events":
      if (
        s.count !== undefined &&
        !(Number.isInteger(s.count) && (s.count as number) >= 1 && (s.count as number) <= 12)
      )
        problems.push("count");
      break;
    default:
  }
  return problems;
}

/** Problems of the whole list, keyed by section id; empty when it can be saved. */
export function homeProblems(sections: readonly HomeSection[]): Record<string, HomeProblem[]> {
  const out: Record<string, HomeProblem[]> = {};
  for (const section of sections) {
    const problems = sectionProblems(section);
    if (problems.length > 0) out[section.id] = problems;
  }
  return out;
}

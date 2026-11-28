import type { HomeSection, PlanItemInput } from "@churchy/contracts";
import { forms, type TermFormsOptions } from "../forms";
import type { NavTemplateItem, PresetPlanTemplate, Rite, ServiceType } from "../schema";

export function rite(nom: string, referencePrefix: string, options?: TermFormsOptions): Rite {
  const f = forms(nom, options);
  return { key: f.slug, forms: f, referencePrefix };
}

export function serviceType(nom: string, main: boolean, options?: TermFormsOptions): ServiceType {
  const f = forms(nom, options);
  return { key: f.slug, forms: f, main };
}

export function homeSections(...types: HomeSection["type"][]): HomeSection[] {
  return types.map((type) => ({ id: `home-${type}`, type, settings: {} }));
}

type ItemType = NonNullable<PlanItemInput["type"]>;
type Item = PresetPlanTemplate["items"][number];
const item =
  (type: ItemType) =>
  (title: string): Item => ({ type, title });

export const song = item("song");
export const liturgy = item("liturgy");
export const reading = item("reading");
export const prayer = item("prayer");
export const sermon = item("sermon");
export const announcement = item("announcement");
export const other = item("other");

export function template(serviceType: string, name: string, items: Item[]): PresetPlanTemplate {
  return { serviceType, name, items };
}

// Navigation building blocks (SDD §6: ≤ 7 top-level items, max depth 2).
export const NAV = {
  home: { term: "homePage", href: "/" },
  schedule: { term: "serviceSchedule", module: "schedule" },
  announcements: { term: "announcementsSection", module: "announcements" },
  news: { term: "newsSection", module: "news" },
  events: { term: "eventsSection", module: "events" },
  rites: { term: "ritesSection", module: "rites" },
  sermons: { term: "sermonsSection", module: "sermons" },
  staff: { term: "staffSection", module: "staff" },
  locations: { term: "locationsSection", module: "locations" },
  groups: { term: "groupsSection", module: "groups" },
  livestream: { term: "livestreamSection", module: "livestream" },
  gallery: { term: "gallerySection", module: "gallery" },
  documents: { term: "documentsSection", module: "documents" },
  contact: { term: "contactPage" },
} as const satisfies Record<string, NavTemplateItem>;

export function about(...children: (typeof NAV)[keyof typeof NAV][]): NavTemplateItem {
  return { term: "aboutPage", children: [...children] };
}

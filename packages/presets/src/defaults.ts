import type { ModuleKey, SiteConfig } from "@churchy/contracts";
import { forms } from "./forms";
import type { SectionTermKey } from "./schema";
import type { TermForms } from "@churchy/contracts";

/**
 * Section and page names shared by all denominations (SDD §6 URL map). Presets override the
 * ones that differ (`ritesSection`, `sermonsSection`, `locationsSection`).
 */
export const PLATFORM_SECTION_TERMS: Record<SectionTermKey, TermForms> = {
  homePage: forms("Kezdőlap"),
  announcementsSection: forms("Hirdetések"),
  newsSection: forms("Hírek"),
  eventsSection: forms("Események"),
  locationsSection: forms("Templomaink"),
  staffSection: forms("Munkatársaink"),
  groupsSection: forms("Közösségeink"),
  ritesSection: forms("Alkalmak"),
  sermonsSection: forms("Igehirdetések"),
  livestreamSection: forms("Élő közvetítés", { slug: "elo" }),
  gallerySection: forms("Galéria"),
  documentsSection: forms("Dokumentumok"),
  givingSection: forms("Támogatás"),
  aboutPage: forms("Rólunk"),
  contactPage: forms("Kapcsolat"),
};

/** Module defaults for every church (SDD §5.5); P2 modules start off. */
export const PLATFORM_MODULES: Record<ModuleKey, boolean> = {
  news: true,
  announcements: true,
  events: true,
  schedule: true,
  locations: true,
  staff: true,
  rites: true,
  groups: true,
  sermons: false,
  livestream: false,
  gallery: true,
  documents: true,
  giving: true,
  onlineGiving: false,
  massIntentions: false,
  funeralNotices: false,
  newsletter: false,
  search: true,
  liturgicalCalendar: true,
};

/**
 * The bottom layer of `effectiveConfig` (SDD §5.1): everything that is neither denomination- nor
 * church-specific. `identity` comes from the tenant row; `navigation` and `home` from the preset.
 */
export type PlatformDefaults = Omit<
  SiteConfig,
  "identity" | "denomination" | "navigation" | "home"
>;

export const PLATFORM_DEFAULTS: PlatformDefaults = {
  terminology: PLATFORM_SECTION_TERMS,
  theme: {
    themeId: "klasszikus",
    colors: { primary: "#6e1f2e", secondary: "#c9a24b" },
    fontPairing: "serif-classic",
    heroStyle: "image-full",
    radius: "small",
  },
  modules: PLATFORM_MODULES,
  footer: { showMap: true, links: [] },
  contact: { officeHours: { weekly: [], exceptions: [] } },
  legal: {},
  giving: { showQr: false },
  integrations: {},
};

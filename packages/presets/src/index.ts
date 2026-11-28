// @churchy/presets — denomination presets and config layering (PRD §5, SDD §5.1–5.3, D-23).
// Pure data and functions; used by both data adapters and the app.

export {
  DENOMINATIONAL_TERM_KEYS,
  NavTemplateItemSchema,
  PresetPlanTemplateSchema,
  PresetSchema,
  PresetSignOffSchema,
  ReviewStatusSchema,
  RiteSchema,
  SECTION_TERM_KEYS,
  ServiceTypeSchema,
  TERM_KEYS,
  TermKeySchema,
} from "./schema";
export type {
  DenominationalTermKey,
  NavTemplateItem,
  Preset,
  PresetInput,
  PresetPlanTemplate,
  PresetSignOff,
  ReviewStatus,
  Rite,
  SectionTermKey,
  ServiceType,
  TermKey,
} from "./schema";

export { forms } from "./forms";
export type { TermFormsOptions } from "./forms";

export { PLATFORM_DEFAULTS, PLATFORM_MODULES, PLATFORM_SECTION_TERMS } from "./defaults";
export type { PlatformDefaults } from "./defaults";

export {
  DENOMINATIONS,
  PRESETS,
  getPreset,
  isBeta,
  presetPlanTemplates,
  presetsAwaitingSignOff,
} from "./presets";

export { deepMerge } from "./merge";
export type { DeepPartial } from "./merge";

export { buildNavigation, configDiff, effectiveConfig, presetDiff, term } from "./config";
export type {
  ConfigDiff,
  EffectiveConfig,
  ModuleChange,
  PathRedirect,
  PresetDiff,
  RiteChange,
  TenantConfigSource,
  TermChange,
} from "./config";

export { findSlugConflicts } from "./validate";

export { renderReviewDoc } from "./review-doc";

import {
  DenominationSchema,
  PlanTemplateSchema,
  type Denomination,
  type PlanTemplate,
} from "@churchy/contracts";
import { gk, rk } from "./data/catholic";
import { bapt, ev, general, ref, unit } from "./data/protestant";
import { PresetSchema, type Preset } from "./schema";

/** Presets in the order of PRD §5.1 (setup wizard order). Validated at module load. */
export const PRESETS: Readonly<Record<Denomination, Preset>> = Object.freeze({
  rk: PresetSchema.parse(rk),
  gk: PresetSchema.parse(gk),
  ref: PresetSchema.parse(ref),
  ev: PresetSchema.parse(ev),
  bapt: PresetSchema.parse(bapt),
  unit: PresetSchema.parse(unit),
  general: PresetSchema.parse(general),
});

export const DENOMINATIONS: readonly Denomination[] = DenominationSchema.options;

export function getPreset(denomination: Denomination): Preset {
  return PRESETS[denomination];
}

/** Whether the setup wizard labels the preset *béta* (no pilot reviewer, D-23 AC4). */
export function isBeta(denomination: Denomination): boolean {
  return PRESETS[denomination].reviewStatus === "beta";
}

/** Presets with a pilot reviewer that have not been signed off yet (blocks R1 GA, M4). */
export function presetsAwaitingSignOff(): Denomination[] {
  return DENOMINATIONS.filter((d) => PRESETS[d].reviewStatus === "pending-review");
}

/**
 * The preset's plan templates (FR-802) as platform-wide `PlanTemplate`s (`tenantId = null`),
 * ready for the seed and the DB migration. Ids are stable: `preset-<denomination>-<serviceType>`.
 */
export function presetPlanTemplates(denomination: Denomination): PlanTemplate[] {
  return PRESETS[denomination].planTemplates.map((t) =>
    PlanTemplateSchema.parse({
      id: `preset-${denomination}-${t.serviceType}`,
      tenantId: null,
      denomination,
      serviceType: t.serviceType,
      name: t.name,
      items: t.items,
    }),
  );
}

import type { Denomination } from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import type { TermMap, TermSource } from "./terms";

const cache = new Map<Denomination, TermMap>();

/**
 * The real term source: the terminology of the denomination presets in `@churchy/presets`
 * (platform defaults + preset, without tenant overrides).
 */
export const presetTermSource: TermSource = {
  termsFor(denomination) {
    let terms = cache.get(denomination);
    if (!terms) {
      terms = effectiveConfig({ name: denomination, denomination }).terminology;
      cache.set(denomination, terms);
    }
    return terms;
  },
};

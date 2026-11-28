import type { TermForms } from "@churchy/contracts";

/**
 * Slugs used by more than one term (two pages would share a URL). The admin term editor shows
 * these before saving an override (FR-102); every preset has none (tested).
 *
 * @returns map of slug → term keys, only for slugs used more than once
 */
export function findSlugConflicts(terms: Record<string, TermForms>): Record<string, string[]> {
  const bySlug = new Map<string, string[]>();
  for (const [key, forms] of Object.entries(terms)) {
    bySlug.set(forms.slug, [...(bySlug.get(forms.slug) ?? []), key]);
  }
  return Object.fromEntries([...bySlug].filter(([, keys]) => keys.length > 1));
}

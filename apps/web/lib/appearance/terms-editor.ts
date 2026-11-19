import type { TermForms } from "@churchy/contracts";
import { article, slugify } from "@churchy/hu";

/**
 * Pure helpers of the terminology editor (D-23, FR-102): the editable part of a term's forms, the
 * forms to store, and the checks shown before saving. The grammatical forms are stored, never
 * derived at runtime (SDD §5.3), so `lower`, `slug` and `article` are computed once here.
 */

/** The slug rule of `SlugSchema`. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface TermDraft {
  nom: string;
  plural: string;
  slug: string;
  article: "a" | "az";
}

export function draftFromForms(forms: TermForms): TermDraft {
  return {
    nom: forms.nom,
    plural: forms.plural ?? "",
    slug: forms.slug,
    article: forms.article,
  };
}

/** The forms to store for a draft (`lower` from the name; an empty plural is left out). */
export function formsFromDraft(draft: TermDraft): TermForms {
  const nom = draft.nom.trim();
  const plural = draft.plural.trim();
  return {
    nom,
    lower: nom.toLocaleLowerCase("hu-HU"),
    slug: draft.slug.trim(),
    article: draft.article,
    ...(plural === "" ? {} : { plural }),
  };
}

/** The slug and article a name suggests (what the editor fills in while the name is typed). */
export function suggestions(nom: string): { slug: string; article: "a" | "az" } {
  const trimmed = nom.trim();
  return { slug: slugify(trimmed), article: trimmed === "" ? "a" : article(trimmed) };
}

export type TermProblem = "nom" | "slug" | "slugTaken";

/**
 * What stops a draft from being saved: an empty name, a slug that is not lowercase kebab-case, or
 * a slug another term already uses (two pages would share a URL). `others` maps slug → term key
 * for the other terms.
 */
export function termProblem(
  draft: TermDraft,
  others: Readonly<Record<string, string>>,
): TermProblem | null {
  if (draft.nom.trim() === "" || draft.nom.length > 200) return "nom";
  if (!SLUG_RE.test(draft.slug.trim())) return "slug";
  if (Object.hasOwn(others, draft.slug.trim())) return "slugTaken";
  return null;
}

/** Whether the stored forms differ from what the preset gives (an override is worth keeping). */
export function sameForms(a: TermForms, b: TermForms): boolean {
  return (
    a.nom === b.nom &&
    a.lower === b.lower &&
    a.slug === b.slug &&
    a.plural === b.plural &&
    a.article === b.article
  );
}

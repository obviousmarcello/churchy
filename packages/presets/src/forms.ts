import type { TermForms } from "@churchy/contracts";
import { article, slugify } from "@churchy/hu";

export interface TermFormsOptions {
  /** In-sentence form; default: `nom` in lower case. */
  lower?: string;
  /** URL segment; default: `slugify(nom)`. */
  slug?: string;
  /** In-sentence plural (`szentmisék`). */
  plural?: string;
}

/**
 * Builds the stored grammatical forms of a term (SDD §5.3) so the UI never suffixes a word at
 * runtime. The article and the slug come from `@churchy/hu`.
 *
 * @example forms("Istentiszteleti rend") // { nom, lower: "istentiszteleti rend", slug: "istentiszteleti-rend", article: "az" }
 */
export function forms(nom: string, options: TermFormsOptions = {}): TermForms {
  const result: TermForms = {
    nom,
    lower: options.lower ?? nom.toLocaleLowerCase("hu-HU"),
    slug: options.slug ?? slugify(nom),
    article: article(nom),
  };
  if (options.plural !== undefined) result.plural = options.plural;
  return result;
}

// @churchy/i18n — terminology (`t.term()`), message term placeholders and Hungarian Zod errors
// (PRD L-01, SDD §5.3, deliverable D-06 [UI]). Pure TypeScript; the next-intl wiring lives in
// apps/web/i18n.
export {
  MissingTermError,
  TERM_FORM_NAMES,
  escapeIcu,
  interpolateTerms,
  resolveCatalogTerms,
  resolveTerms,
  termPlaceholders,
  termsFromConfig,
  termsFromMap,
  withTerms,
  type MessageTree,
  type ResolveTermsInput,
  type TermFormName,
  type TermKey,
  type TermMap,
  type TermSource,
  type Terms,
} from "./terms";
export { presetTermSource } from "./preset-terms";
export { configureZodHungarian, huZodErrorMap, huZodLocale } from "./zod-hu";

/**
 * Test helpers: a strict translator over the real `messages/hu.json` (namespace `email`) with the
 * denomination's terminology resolved, formatted by the same ICU engine next-intl uses. A missing
 * message or a missing placeholder value throws, so a template that drifts from the catalog fails.
 */
import { readFileSync } from "node:fs";
import { IntlMessageFormat } from "intl-messageformat";
import {
  presetTermSource,
  resolveCatalogTerms,
  resolveTerms,
  type MessageTree,
} from "@churchy/i18n";
import type { EmailContext, Translate } from "./types";

export const catalog = JSON.parse(
  readFileSync(new URL("../../../messages/hu.json", import.meta.url), "utf8"),
) as MessageTree;

export type TestDenomination = "rk" | "ref" | "bapt";

function lookup(tree: MessageTree, path: string): string {
  let node: string | MessageTree | undefined = tree;
  for (const part of path.split(".")) {
    node = typeof node === "object" ? node[part] : undefined;
  }
  if (typeof node !== "string") throw new Error(`Missing message "email.${path}"`);
  return node;
}

export function translatorFor(denomination: TestDenomination = "rk"): Translate {
  const terms = resolveTerms({ source: presetTermSource, denomination });
  const email = resolveCatalogTerms(catalog, terms)["email"] as MessageTree;
  return (key, values) => {
    const out = new IntlMessageFormat(lookup(email, key), "hu").format(values ?? {});
    return String(out);
  };
}

export function contextFor(
  denomination: TestDenomination = "rk",
  overrides: Partial<EmailContext> = {},
): EmailContext {
  return {
    t: translatorFor(denomination),
    churchName: "Belvárosi Plébánia",
    baseUrl: "https://demo.churchy.test",
    ...overrides,
  };
}

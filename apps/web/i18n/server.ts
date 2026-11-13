import { getTranslations } from "next-intl/server";
import type { NamespaceKeys, NestedKeyOf } from "next-intl";
import { withTerms } from "@churchy/i18n";
import type huMessages from "@messages/hu.json";
import { getTerms } from "./terms";

type AppMessages = typeof huMessages;

/**
 * `getTranslations()` plus `t.term()` for server components:
 *
 *   const t = await getT("public.home");
 *   t("placeholderTitle");
 *   t.term("serviceSchedule").nom; // "Miserend" / "Istentiszteleti rend"
 */
export async function getT<
  Namespace extends NamespaceKeys<AppMessages, NestedKeyOf<AppMessages>> = never,
>(namespace?: Namespace) {
  return withTerms(await getTranslations<Namespace>(namespace), getTerms());
}

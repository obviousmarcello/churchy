"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { NamespaceKeys, NestedKeyOf } from "next-intl";
import type { Denomination } from "@churchy/contracts";
import { termsFromMap, withTerms, type TermMap, type Terms } from "@churchy/i18n";
import type huMessages from "@messages/hu.json";

type AppMessages = typeof huMessages;

const TermsContext = createContext<Terms | null>(null);

/** Gives client components the tenant's terminology (`terms.all()` from the server). */
export function TermsProvider({
  denomination,
  terms,
  children,
}: {
  denomination: Denomination;
  terms: TermMap;
  children: ReactNode;
}) {
  const value = useMemo(() => termsFromMap(denomination, terms), [denomination, terms]);
  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
}

export function useTerms(): Terms {
  const terms = useContext(TermsContext);
  if (!terms) {
    throw new Error("useTerms() needs a <TermsProvider> (it is set up in the root layout)");
  }
  return terms;
}

/** `useTranslations()` plus `t.term()` for client components (and sync server components). */
export function useT<
  Namespace extends NamespaceKeys<AppMessages, NestedKeyOf<AppMessages>> = never,
>(
  namespace?: Namespace,
  // Spelled out: inferred through `withTerms`, the key type of a namespaced translator was lost.
): ReturnType<typeof useTranslations<Namespace>> & { term: Terms["term"] } {
  const t = useTranslations<Namespace>(namespace);
  const terms = useTerms();
  return useMemo(() => withTerms(t, terms), [t, terms]);
}

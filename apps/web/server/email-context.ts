import { createTranslator } from "next-intl";
import type { EmailContext, Translate } from "@churchy/email";
import type { MessageTree, Terms } from "@churchy/i18n";
import huMessages from "@messages/hu.json";
import { catalogFor, termsForSiteConfig, termsForTenant } from "@/i18n/terms";
import { FALLBACK_SITE_CONFIG } from "@/lib/site-config";
import type { OutboxMessage } from "@/server/data-adapters";

const translators = new Map<string, Translate>();

/** `email.*` translator for one terminology (so a Reformed church reads *istentisztelet*). */
function translatorFor(terms: Terms): Translate {
  const hit = translators.get(terms.fingerprint);
  if (hit) return hit;
  const translator = createTranslator({
    locale: "hu",
    messages: catalogFor(huMessages as MessageTree, terms) as unknown as typeof huMessages,
    namespace: "email",
    // A missing message is a bug in a template, not something to paper over with a fallback.
    onError: (error) => {
      throw error;
    },
  }) as unknown as Translate;
  translators.set(terms.fingerprint, translator);
  return translator;
}

/** What the sending worker would render this message with: the tenant's terms, name and origin. */
export function emailContextFor(message: OutboxMessage, baseUrl: string): EmailContext {
  const { tenant } = message;
  // Messages carry their own tenant; one without (an organization-level message) gets the
  // platform fallback, never whichever church the viewer happens to have selected.
  const terms = tenant ? termsForTenant(tenant) : termsForSiteConfig(FALLBACK_SITE_CONFIG);
  return {
    t: translatorFor(terms),
    churchName: tenant?.name ?? FALLBACK_SITE_CONFIG.name,
    baseUrl,
  };
}

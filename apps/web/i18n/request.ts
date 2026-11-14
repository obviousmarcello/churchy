import { getRequestConfig } from "next-intl/server";
import type { MessageTree } from "@churchy/i18n";
import huMessages from "@messages/hu.json";
import { catalogFor, getTerms } from "./terms";

/** Hungarian only (PRD L-01): one locale, one catalog, Budapest time. */
export const LOCALE = "hu";
export const TIME_ZONE = "Europe/Budapest";

export default getRequestConfig(async () => ({
  locale: LOCALE,
  timeZone: TIME_ZONE,
  // Term placeholders ({service.plural}) are resolved from the request tenant's terminology before
  // next-intl formats the message, on the server and for client components alike.
  messages: catalogFor(huMessages as MessageTree, await getTerms()),
}));

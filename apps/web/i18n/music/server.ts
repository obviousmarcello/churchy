import "server-only";

import { getMessages } from "next-intl/server";
import { createI18n, type I18n } from "./i18n";
import type { Messages } from "./messages";

/** The music module's text and formats (Server Components, `generateMetadata`). */
export async function getI18n(): Promise<I18n> {
  const messages = (await getMessages()) as unknown as { music: Messages };
  return createI18n(messages.music);
}

/** The same for Server Actions, Route Handlers and models (one language: Hungarian). */
export const getRequestI18n = getI18n;

"use client";

import { useMessages } from "next-intl";
import { usePathname } from "next/navigation";
import { createI18n, type I18n } from "./i18n";
import type { Messages } from "./messages";

/** The music module's text and formats in a Client Component (messages of the root provider). */
export function useI18n(): I18n {
  const messages = useMessages() as unknown as { music: Messages };
  return createI18n(messages.music);
}

/** The pathname of the page (Churchy has no language segment). */
export function useAppPathname(): string {
  return usePathname();
}

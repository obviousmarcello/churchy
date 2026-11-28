import type { ReactNode } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { themeAttributes } from "@churchy/themes";
import { PageTransition } from "@churchy/ui";
import { DemoChip } from "@/components/demo-chip";
import { TermsProvider } from "@/i18n/client";
import { getTerms } from "@/i18n/terms";
import { demoModeEnabled } from "@/lib/demo/flag";
import { requestOrigin } from "@/server/public-events";
import { getSiteConfig } from "@/server/site-config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const [t, origin] = await Promise.all([getTranslations("common"), requestOrigin()]);
  return {
    title: t("appName"),
    // Relative canonical / Open Graph URLs resolve against the request's own host (D-17).
    metadataBase: new URL(origin),
    // The demo deployment is never indexed (D-92 AC3).
    ...(demoModeEnabled() ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // DEMO_MODE and the demo cookies are read at runtime, so every page renders per request.
  await connection();
  // Theme and terminology follow the request's church (`getRequestContext()`).
  const [{ theme }, locale, terms] = await Promise.all([getSiteConfig(), getLocale(), getTerms()]);
  return (
    <html lang={locale} {...themeAttributes(theme)}>
      <body>
        <NextIntlClientProvider>
          <TermsProvider denomination={terms.denomination} terms={terms.all()}>
            {/* Design v2: animated page changes (View Transitions API; instant when unsupported). */}
            <PageTransition>{children}</PageTransition>
            {/* Last in the tab order, floating bottom-left; hidden on the landing page. */}
            <DemoChip />
          </TermsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { themeAttributes } from "@churchy/themes";
import { TermsProvider } from "@/i18n/client";
import { getTerms } from "@/i18n/terms";
import { getSiteConfig } from "@/lib/site-config";
import "./globals.css";

export async function generateMetadata() {
  const t = await getTranslations("common");
  return { title: t("appName") };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = getSiteConfig();
  const locale = await getLocale();
  const terms = getTerms();
  return (
    <html lang={locale} {...themeAttributes(theme)}>
      <body>
        <NextIntlClientProvider>
          <TermsProvider denomination={terms.denomination} terms={terms.all()}>
            {children}
          </TermsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

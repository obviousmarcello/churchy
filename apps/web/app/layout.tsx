import type { ReactNode } from "react";
import { themeAttributes } from "@churchy/themes";
import messages from "@messages/hu.json";
import { getSiteConfig } from "@/lib/site-config";
import "./globals.css";

export const metadata = {
  title: messages.common.appName,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = getSiteConfig();
  return (
    <html lang="hu" {...themeAttributes(theme)}>
      <body>{children}</body>
    </html>
  );
}

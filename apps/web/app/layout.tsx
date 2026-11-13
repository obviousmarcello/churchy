import type { ReactNode } from "react";
import messages from "@messages/hu.json";

export const metadata = {
  title: messages.common.appName,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hu">
      <body>
        <a href="#tartalom" className="skip-link">
          {messages.common.skipToContent}
        </a>
        <main id="tartalom">{children}</main>
      </body>
    </html>
  );
}

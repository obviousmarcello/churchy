import type { ReactNode } from "react";
import { AdminScope, PageShell } from "@churchy/ui";
import { PlatformFooter } from "@/components/platform/platform-footer";
import { PlatformHeader } from "@/components/platform/platform-header";
import { getT } from "@/i18n/server";

/**
 * Layout of the Churchy platform pages (the landing page `/` and the sign-in `/belepes`): the
 * product's own header and footer, in the product's neutral look (the admin tokens), never a
 * church's theme or `SiteHeader`. A church's public site lives under its own host, or under
 * `/demo/<slug>` in the demo (`proxy.ts`).
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const common = await getT("common");
  return (
    <AdminScope className="bg-surface-app">
      <PageShell
        skipLinkLabel={common("skipToContent")}
        header={<PlatformHeader />}
        footer={<PlatformFooter />}
      >
        {children}
      </PageShell>
    </AdminScope>
  );
}

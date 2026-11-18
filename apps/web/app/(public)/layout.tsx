import type { ReactNode } from "react";
import { SiteFooter } from "@/components/public/site-footer";

/**
 * Public site layout (D-17): every public page gets the church's footer. Pages render their own
 * `<PageShell>` (skip link, header, main); the footer follows it, and the shell stops claiming the
 * full viewport height so the footer sits at the bottom of short pages instead of below the fold.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col *:first:flex-1 *:first:min-h-0">
      {children}
      <SiteFooter />
    </div>
  );
}

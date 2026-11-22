import type { ReactNode } from "react";
import { Breadcrumbs, PageHeader, type BreadcrumbItem } from "@churchy/ui";
import { getT } from "@/i18n/server";

/**
 * Breadcrumbs from the home page, for public pages whose title block is rendered elsewhere (a
 * news post, an event): `trail` are the ancestors, `current` the page itself.
 */
export async function PublicBreadcrumbs({
  trail,
  current,
}: {
  trail: BreadcrumbItem[];
  current: string;
}) {
  const t = await getT("public.chrome");
  return (
    <Breadcrumbs
      label={t("breadcrumbs")}
      items={[{ label: t("home"), href: "/" }, ...trail, { label: current }]}
      className="print:hidden"
    />
  );
}

/**
 * Top of every public sub-page (UI-02): breadcrumbs from the home page (on phones only the parent,
 * as a back link), the one `h1` in the brand colour, an optional lead, meta line and actions.
 * `trail` lists the ancestors between the home page and this page.
 */
export async function PublicPageHeader({
  title,
  lead,
  trail = [],
  meta,
  actions,
  id,
  className,
  "data-testid": testId,
}: {
  title: string;
  lead?: ReactNode;
  trail?: BreadcrumbItem[];
  meta?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const t = await getT("public.chrome");
  return (
    <PageHeader
      variant="public"
      title={title}
      breadcrumbs={
        <Breadcrumbs
          label={t("breadcrumbs")}
          items={[{ label: t("home"), href: "/" }, ...trail, { label: title }]}
          className="print:hidden"
        />
      }
      {...(lead ? { description: lead } : {})}
      {...(meta ? { meta } : {})}
      {...(actions ? { actions } : {})}
      {...(id ? { id } : {})}
      {...(testId ? { "data-testid": testId } : {})}
      {...(className ? { className } : {})}
    />
  );
}

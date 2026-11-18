import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, ButtonLink } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { canOpenAdminSection } from "@/server/admin";

export interface Crumb {
  /** Visible text (already translated). */
  label: string;
  /** Omit for the current page (the last crumb). */
  href?: string;
}

/**
 * Breadcrumb trail. The dashboard is always the first crumb; pass the rest, ending with the
 * current page (without `href`).
 */
export async function AdminBreadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const t = await getT("admin.shell");
  const crumbs: Crumb[] = [{ label: t("dashboard"), href: "/admin" }, ...trail];
  return (
    <nav aria-label={t("breadcrumbs")} data-testid="admin-breadcrumbs">
      <ol className="flex flex-wrap items-center gap-x-2 text-fs-2 text-muted">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${i}-${crumb.label}`} className="flex items-center gap-x-2">
              {i > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.href !== undefined && !last ? (
                <Link
                  href={crumb.href}
                  className="inline-flex min-h-11 items-center font-semibold text-primary"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="font-semibold text-text">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface AdminHeaderProps {
  /** The page's `<h1>`. */
  title: string;
  /** One plain sentence under the title. */
  lead?: string;
  /** Page actions; keep to **one primary action** per screen (SDD §11.2). */
  actions?: ReactNode;
}

/** Page title (`h1`), lead text and the page's primary action. */
export function AdminHeader({ title, lead, actions }: AdminHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-fs-6 leading-tight font-bold text-primary">{title}</h1>
        {lead ? <p className="mt-2 max-w-prose text-fs-4 text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}

export interface AdminPageProps extends AdminHeaderProps {
  /** Crumbs after the dashboard, ending with the current page. Omit for a top-level section. */
  breadcrumbs?: readonly Crumb[];
  /**
   * Id of the admin section the page belongs to (`buildAppNav()`, e.g. `"news"`). When the actor
   * may not open it, a no-access notice replaces the content: `can()` decides, not the page.
   * Hiding is not enforcing: server actions still go through `withPolicy()`.
   */
  section?: string;
  /** Test hook on the content wrapper. */
  testId?: string;
  children?: ReactNode;
}

/** No-access notice for a section the actor may not open. */
export async function AdminNoAccess() {
  const t = await getT("admin.page");
  return (
    <div className="max-w-prose" data-testid="area-no-access">
      <Alert tone="warning" title={t("noAccessTitle")}>
        <p>{t("noAccessBody")}</p>
      </Alert>
      <p className="mt-4">
        <ButtonLink href="/admin" variant="secondary">
          {t("backToDashboard")}
        </ButtonLink>
      </p>
    </div>
  );
}

/**
 * The standard admin screen: breadcrumbs, `AdminHeader`, then the content. Every admin route
 * renders inside `app/admin/layout.tsx` (sidebar, top bar), so this only provides the page body.
 *
 * ```tsx
 * <AdminPage title={t("title")} section="news" breadcrumbs={[{ label: t("title") }]}
 *            actions={<ButtonLink href="/admin/hirek/uj">{t("new")}</ButtonLink>}>
 *   <DataTable … />
 * </AdminPage>
 * ```
 */
export async function AdminPage({
  title,
  lead,
  actions,
  breadcrumbs,
  section,
  testId,
  children,
}: AdminPageProps) {
  const allowed = section === undefined || (await canOpenAdminSection(section));
  if (!allowed) {
    return (
      <div className="flex flex-col gap-6">
        <AdminBreadcrumbs trail={[{ label: title }]} />
        <h1 className="font-heading text-fs-6 leading-tight font-bold text-primary">{title}</h1>
        <AdminNoAccess />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      {breadcrumbs !== undefined ? <AdminBreadcrumbs trail={breadcrumbs} /> : null}
      <AdminHeader title={title} lead={lead} actions={actions} />
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { Alert, ButtonLink } from "@churchy/ui";
import { AdminPage, type Crumb } from "@/components/admin";
import { getT } from "@/i18n/server";

/**
 * Admin preview of a draft (D-20): the public page's own template inside a banner. The route sits
 * under `/admin`, so it is gated by `can()` like every admin screen: visitors never get it.
 */
export async function PreviewFrame({
  title,
  section,
  breadcrumbs,
  editHref,
  children,
}: {
  title: string;
  section: string;
  breadcrumbs: readonly Crumb[];
  editHref: string;
  children: ReactNode;
}) {
  const t = await getT("admin.content.preview");
  return (
    <AdminPage
      title={t("heading", { title })}
      section={section}
      breadcrumbs={breadcrumbs}
      testId="admin-preview"
      actions={
        <ButtonLink href={editHref} variant="secondary">
          {t("back")}
        </ButtonLink>
      }
    >
      <Alert tone="info" title={t("title")}>
        <p>{t("body")}</p>
      </Alert>
      <div
        className="rounded-md border-2 border-dashed border-border-strong p-4 sm:p-8"
        data-testid="preview-content"
      >
        <article className="mx-auto flex w-full max-w-(--content-max) flex-col gap-8">
          {children}
        </article>
      </div>
    </AdminPage>
  );
}

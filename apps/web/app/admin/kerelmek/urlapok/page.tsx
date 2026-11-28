import Link from "next/link";
import { Badge, ButtonLink } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { RequestsTabs } from "@/components/admin/requests/request-parts";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.requests.forms"), getT("common")]);
  return {
    title: `${t("title")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** The church's request forms (D-28): one per rite, edited in the form builder. */
export default async function Page() {
  const [nav, t, list] = await Promise.all([
    getT("common.nav"),
    getT("admin.requests.forms"),
    getT("admin.content.list"),
  ]);
  const section = nav("sections.requests");
  if (!(await mayOpen("requests"))) return <AdminPage title={section} section="requests" />;

  const { ctx, repos } = await adminData();
  const forms = await repos.requests.listForms(ctx, { includeInactive: true });

  return (
    <AdminPage
      title={t("title")}
      lead={t("lead")}
      section="requests"
      breadcrumbs={[{ label: section, href: "/admin/kerelmek" }, { label: t("title") }]}
      testId="admin-request-forms"
      actions={<ButtonLink href="/admin/kerelmek/urlapok/uj">{t("newButton")}</ButtonLink>}
    >
      <RequestsTabs current="forms" />
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="forms-table"
        rows={forms}
        rowKey={(f) => f.id}
        empty={t("empty")}
        columns={[
          {
            key: "title",
            header: t("columns.title"),
            rowHeader: true,
            cell: (f) => (
              <Link
                href={`/admin/kerelmek/urlapok/${f.key}`}
                className="font-semibold text-primary"
              >
                {f.title}
              </Link>
            ),
          },
          { key: "key", header: t("columns.key"), cell: (f) => f.key },
          { key: "fields", header: t("columns.fields"), cell: (f) => f.fields.length },
          { key: "prefix", header: t("columns.prefix"), cell: (f) => f.referencePrefix },
          {
            key: "active",
            header: t("columns.active"),
            cell: (f) => (
              <Badge tone={f.active ? "success" : "neutral"}>
                {f.active ? t("active") : t("inactive")}
              </Badge>
            ),
          },
          {
            key: "actions",
            header: list("actions"),
            align: "end",
            cell: (f) => (
              <ButtonLink
                href={`/admin/kerelmek/urlapok/${f.key}`}
                variant="ghost"
                size="sm"
                aria-label={t("editItem", { name: f.title })}
              >
                {t("edit")}
              </ButtonLink>
            ),
          },
        ]}
      />
    </AdminPage>
  );
}

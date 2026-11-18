import Link from "next/link";
import { Badge, ButtonLink } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters, StateBadge } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { publishState } from "@/lib/admin/content";
import { deletePage } from "@/server/content-actions";
import { adminData, matches, matchesState, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.pages")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Static and rite pages (D-21): search, state filter, edit, delete. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.pages"),
    getT("admin.content.list"),
  ]);
  const title = nav("sections.pages");
  if (!(await mayOpen("pages"))) return <AdminPage title={title} section="pages" />;

  const { q, state } = parseFilters(await searchParams);
  const { ctx, repos, now } = await adminData();
  const all = await repos.pages.list(ctx);
  const titles = new Map(all.map((p) => [p.id, p.title]));
  const rows = all
    .filter((p) => matches(q, p.title, p.slug))
    .filter((p) => matchesState(state, p, now));

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.pages"))("lead")}
      section="pages"
      breadcrumbs={[{ label: title }]}
      testId="admin-pages"
      actions={<ButtonLink href="/admin/oldalak/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters q={q} state={state} action="/admin/oldalak" />
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="pages-table"
        rows={rows}
        rowKey={(p) => p.id}
        empty={all.length === 0 ? t("empty") : t("emptyFiltered")}
        columns={[
          {
            key: "title",
            header: t("columns.title"),
            rowHeader: true,
            cell: (p) => (
              <span className="inline-flex flex-wrap items-center gap-2">
                <Link href={`/admin/oldalak/${p.id}`} className="font-semibold text-primary">
                  {p.title}
                </Link>
                {p.riteKey !== null ? <Badge tone="accent">{t("rite")}</Badge> : null}
              </span>
            ),
          },
          { key: "slug", header: t("columns.slug"), cell: (p) => <code>/{p.slug}</code> },
          {
            key: "parent",
            header: t("columns.parent"),
            cell: (p) => (p.parentId ? (titles.get(p.parentId) ?? "–") : "–"),
          },
          {
            key: "state",
            header: t("columns.state"),
            cell: (p) => <StateBadge state={publishState(p, now)} />,
          },
          {
            key: "actions",
            header: list("actions"),
            align: "end",
            cell: (p) => (
              <span className="inline-flex items-center gap-1">
                <ButtonLink
                  href={`/admin/oldalak/${p.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={list("editItem", { name: p.title })}
                >
                  {list("edit")}
                </ButtonLink>
                <DeleteButton name={p.title} onDelete={deletePage.bind(null, p.id)} />
              </span>
            ),
          },
        ]}
      />
    </AdminPage>
  );
}

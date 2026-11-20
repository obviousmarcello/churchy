import Link from "next/link";
import { ButtonLink, FormattedDate } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters, StateBadge } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { publishState } from "@/lib/admin/content";
import { deleteNews } from "@/server/content-actions";
import { adminData, matches, matchesState, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.news")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** News list (D-21): search, state filter, edit and delete (with confirmation). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.news"),
    getT("admin.content.list"),
  ]);
  const title = nav("sections.news");
  if (!(await mayOpen("news"))) return <AdminPage title={title} section="news" />;

  const { q, state } = parseFilters(await searchParams);
  const { ctx, repos, now } = await adminData();
  const all = (await repos.news.list(ctx, { pageSize: 200 })).items;
  const rows = all
    .filter((p) => matches(q, p.title, p.lead, p.categories.join(" ")))
    .filter((p) => matchesState(state, p, now));

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.news"))("lead")}
      section="news"
      breadcrumbs={[{ label: title }]}
      testId="admin-news"
      actions={<ButtonLink href="/admin/hirek/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters q={q} state={state} action="/admin/hirek" />
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="news-table"
        rows={rows}
        rowKey={(p) => p.id}
        empty={all.length === 0 ? t("empty") : t("emptyFiltered")}
        columns={[
          {
            key: "title",
            header: t("columns.title"),
            rowHeader: true,
            cell: (p) => (
              <Link href={`/admin/hirek/${p.id}`} className="font-semibold text-primary">
                {p.title}
              </Link>
            ),
          },
          {
            key: "state",
            header: t("columns.state"),
            cell: (p) => <StateBadge state={publishState(p, now)} />,
          },
          {
            key: "date",
            header: t("columns.date"),
            cell: (p) =>
              p.publishedAt ? <FormattedDate value={p.publishedAt} format="short" /> : "–",
          },
          {
            key: "actions",
            header: list("actions"),
            align: "end",
            cell: (p) => (
              <span className="inline-flex items-center gap-1">
                <ButtonLink
                  href={`/admin/hirek/${p.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={list("editItem", { name: p.title })}
                >
                  {list("edit")}
                </ButtonLink>
                <DeleteButton name={p.title} onDelete={deleteNews.bind(null, p.id)} />
              </span>
            ),
          },
        ]}
      />
    </AdminPage>
  );
}

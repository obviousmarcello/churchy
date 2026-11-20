import Link from "next/link";
import { ButtonLink, FormattedDate } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters, StateBadge } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { publishState, textFromDoc } from "@/lib/admin/content";
import { deleteAnnouncement } from "@/server/content-actions";
import { adminData, matches, matchesState, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.announcements")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Weekly announcements (D-21): newest week first, search, state filter, edit, delete. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.announcements"),
    getT("admin.content.list"),
  ]);
  const title = nav("sections.announcements");
  if (!(await mayOpen("announcements"))) {
    return <AdminPage title={title} section="announcements" />;
  }

  const { q, state } = parseFilters(await searchParams);
  const { ctx, repos, now } = await adminData();
  const all = (await repos.announcements.list(ctx, { pageSize: 200 })).items;
  const rows = all
    .filter((a) => matches(q, textFromDoc(a.body), a.weekSunday))
    .filter((a) => matchesState(state, a, now));

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.announcements"))("lead")}
      section="announcements"
      breadcrumbs={[{ label: title }]}
      testId="admin-announcements"
      actions={<ButtonLink href="/admin/hirdetesek/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters q={q} state={state} action="/admin/hirdetesek" />
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="announcements-table"
        rows={rows}
        rowKey={(a) => a.id}
        empty={all.length === 0 ? t("empty") : t("emptyFiltered")}
        columns={[
          {
            key: "week",
            header: t("columns.week"),
            rowHeader: true,
            cell: (a) => (
              <Link href={`/admin/hirdetesek/${a.id}`} className="font-semibold text-primary">
                <FormattedDate value={a.weekSunday} />
              </Link>
            ),
          },
          {
            key: "state",
            header: t("columns.state"),
            cell: (a) => <StateBadge state={publishState(a, now)} />,
          },
          {
            key: "date",
            header: t("columns.date"),
            cell: (a) =>
              a.publishedAt ? <FormattedDate value={a.publishedAt} format="short" /> : "–",
          },
          {
            key: "actions",
            header: list("actions"),
            align: "end",
            cell: (a) => (
              <span className="inline-flex items-center gap-1">
                <ButtonLink
                  href={`/admin/hirdetesek/${a.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={list("editItem", { name: a.weekSunday })}
                >
                  {list("edit")}
                </ButtonLink>
                <DeleteButton name={a.weekSunday} onDelete={deleteAnnouncement.bind(null, a.id)} />
              </span>
            ),
          },
        ]}
      />
    </AdminPage>
  );
}

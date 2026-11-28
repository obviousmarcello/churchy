import Link from "next/link";
import { ButtonLink, FormattedDate, FormattedTime } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters, StateBadge } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { deleteEvent } from "@/server/content-actions";
import { adminData, matches, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.events")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const WINDOW = { from: "2000-01-01T00:00:00Z", to: "2100-01-01T00:00:00Z" };

/** Events (D-21): latest start first; recurring series are listed once (their first start). */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list, visibility] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.events"),
    getT("admin.content.list"),
    getT("admin.content.events.visibility"),
  ]);
  const title = nav("sections.events");
  if (!(await mayOpen("events"))) return <AdminPage title={title} section="events" />;

  const { q, state } = parseFilters(await searchParams);
  const { ctx, repos } = await adminData();
  const all = (await repos.events.list(ctx, WINDOW))
    .filter((e) => e.parentEventId === null)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const rows = all
    .filter((e) => matches(q, e.title, e.category))
    .filter((e) => state === "" || e.status === state);

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.events"))("lead")}
      section="events"
      breadcrumbs={[{ label: title }]}
      testId="admin-events"
      actions={<ButtonLink href="/admin/esemenyek/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters
        q={q}
        state={state}
        states={["draft", "published", "cancelled"]}
        action="/admin/esemenyek"
      />
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="events-table"
        rows={rows}
        rowKey={(e) => e.id}
        empty={all.length === 0 ? t("empty") : t("emptyFiltered")}
        columns={[
          {
            key: "title",
            header: t("columns.title"),
            rowHeader: true,
            cell: (e) => (
              <Link href={`/admin/esemenyek/${e.id}`} className="font-semibold text-primary">
                {e.title}
              </Link>
            ),
          },
          {
            key: "when",
            header: t("columns.when"),
            cell: (e) => (
              <span>
                <FormattedDate value={e.startsAt} format="short" />
                {e.allDay ? null : (
                  <>
                    {", "}
                    <FormattedTime value={e.startsAt} />
                  </>
                )}
              </span>
            ),
          },
          {
            key: "state",
            header: t("columns.state"),
            cell: (e) => <StateBadge state={e.status} />,
          },
          {
            key: "visibility",
            header: t("columns.visibility"),
            cell: (e) => visibility(e.visibility),
          },
          {
            key: "actions",
            header: list("actions"),
            align: "end",
            cell: (e) => (
              <span className="inline-flex items-center gap-1">
                <ButtonLink
                  href={`/admin/esemenyek/${e.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={list("editItem", { name: e.title })}
                >
                  {list("edit")}
                </ButtonLink>
                <DeleteButton name={e.title} onDelete={deleteEvent.bind(null, e.id)} />
              </span>
            ),
          },
        ]}
      />
    </AdminPage>
  );
}

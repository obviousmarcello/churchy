import Link from "next/link";
import { Button, ButtonLink, DateInput, FormattedDate, FormattedTime, Select } from "@churchy/ui";
import { AdminPage, DataTable } from "@/components/admin";
import { RequestStatusBadge, RequestsTabs } from "@/components/admin/requests/request-parts";
import { getT } from "@/i18n/server";
import { countByStatus, filterRequests, isFiltered, parseInboxFilters } from "@/lib/requests/admin";
import { adminData, mayOpen } from "@/server/content-admin";
import { memberMayHandleRequests } from "@/server/session";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.requests")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Requests inbox (D-29): reference number, form, received, status and assignee, filtered by
 * status, form, assignee and date. The submitted data is on the request's own screen.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, status] = await Promise.all([
    getT("common.nav"),
    getT("admin.requests.inbox"),
    getT("admin.requests.status"),
  ]);
  const title = nav("sections.requests");
  if (!(await mayOpen("requests"))) return <AdminPage title={title} section="requests" />;

  const filters = parseInboxFilters(await searchParams);
  const { ctx, repos } = await adminData();
  const [all, forms, members] = await Promise.all([
    repos.requests.list(ctx),
    repos.requests.listForms(ctx, { includeInactive: true }),
    repos.members.list(ctx),
  ]);
  const handlers = members.filter(memberMayHandleRequests);
  const nameOf = new Map(members.map((m) => [m.userId, m.user.name]));
  const formTitle = new Map(forms.map((f) => [f.key, f.title]));
  const rows = filterRequests(all, filters);
  const counts = countByStatus(all);

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.requests"))("lead")}
      section="requests"
      breadcrumbs={[{ label: title }]}
      testId="admin-requests"
      actions={
        <ButtonLink href="/admin/kerelmek/urlapok" variant="secondary">
          {t("formsButton")}
        </ButtonLink>
      }
    >
      <RequestsTabs current="inbox" />

      <ul
        className="flex flex-wrap gap-3"
        aria-label={t("summaryLabel")}
        data-testid="requests-summary"
      >
        {(["uj", "folyamatban", "lezart"] as const).map((s) => (
          <li key={s}>
            <Link
              href={`/admin/kerelmek?allapot=${s}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-border-strong px-4 font-semibold text-primary"
              data-testid={`summary-${s}`}
            >
              {status(s)}
              <span className="rounded-full bg-surface-sunken px-2 text-text">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>

      <form
        method="get"
        role="search"
        aria-label={t("filters.label")}
        className="flex flex-wrap items-end gap-4"
        data-testid="requests-filters"
      >
        <Select
          name="allapot"
          label={t("filters.status")}
          defaultValue={filters.status}
          options={[
            { value: "", label: t("filters.allStatuses") },
            ...(["uj", "folyamatban", "lezart"] as const).map((s) => ({
              value: s,
              label: status(s),
            })),
          ]}
          wrapperClassName="min-w-44"
        />
        <Select
          name="urlap"
          label={t("filters.form")}
          defaultValue={filters.form}
          options={[
            { value: "", label: t("filters.allForms") },
            ...forms.map((f) => ({ value: f.key, label: f.title })),
          ]}
          wrapperClassName="min-w-56"
        />
        <Select
          name="felelos"
          label={t("filters.assignee")}
          defaultValue={filters.assignee}
          options={[
            { value: "", label: t("filters.anyAssignee") },
            { value: "none", label: t("filters.unassigned") },
            ...handlers.map((m) => ({ value: m.userId, label: m.user.name })),
          ]}
          wrapperClassName="min-w-56"
        />
        <DateInput name="tol" label={t("filters.from")} defaultValue={filters.from} />
        <DateInput name="ig" label={t("filters.to")} defaultValue={filters.to} />
        <Button type="submit" variant="secondary">
          {t("filters.apply")}
        </Button>
        {isFiltered(filters) ? (
          <Link
            href="/admin/kerelmek"
            className="inline-flex min-h-11 items-center px-2 font-semibold text-primary"
          >
            {t("filters.reset")}
          </Link>
        ) : null}
      </form>

      <p className="text-fs-3 text-muted" data-testid="requests-count">
        {t("count", { count: rows.length })}
      </p>
      <DataTable
        caption={t("caption")}
        captionHidden
        testId="requests-table"
        rows={rows}
        rowKey={(r) => r.id}
        empty={all.length === 0 ? t("empty") : t("emptyFiltered")}
        columns={[
          {
            key: "reference",
            header: t("columns.reference"),
            rowHeader: true,
            cell: (r) => (
              <Link href={`/admin/kerelmek/${r.id}`} className="font-semibold text-primary">
                {r.reference}
              </Link>
            ),
          },
          {
            key: "form",
            header: t("columns.form"),
            cell: (r) => formTitle.get(r.formKey) ?? r.formKey,
          },
          {
            key: "received",
            header: t("columns.received"),
            cell: (r) => (
              <>
                <FormattedDate value={r.createdAt} format="short" />{" "}
                <FormattedTime value={r.createdAt} />
              </>
            ),
          },
          {
            key: "status",
            header: t("columns.status"),
            cell: (r) => <RequestStatusBadge status={r.status} />,
          },
          {
            key: "assignee",
            header: t("columns.assignee"),
            cell: (r) =>
              r.assigneeUserId === null
                ? t("unassigned")
                : (nameOf.get(r.assigneeUserId) ?? t("unassigned")),
          },
        ]}
      />
    </AdminPage>
  );
}

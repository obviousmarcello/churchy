import Link from "next/link";
import { huCollator } from "@churchy/contracts";
import { formatPersonName } from "@churchy/hu";
import { Badge, ButtonLink } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters } from "@/components/admin/content/list-parts";
import { ReorderList } from "@/components/admin/content/reorder-list";
import { getT } from "@/i18n/server";
import { deleteStaff, reorderStaff } from "@/server/content-actions";
import { adminData, matches, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.staff")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * People of the public staff page (D-21): in the church's own order (the public page groups them
 * by clergy / staff / council), reordered by drag and drop. Ordering is off while searching.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list, groups] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.staff"),
    getT("admin.content.list"),
    getT("admin.content.staff.groups"),
  ]);
  const title = nav("sections.staff");
  if (!(await mayOpen("staff"))) return <AdminPage title={title} section="staff" />;

  const { q } = parseFilters(await searchParams);
  const { ctx, repos } = await adminData();
  const all = (await repos.people.list(ctx)).sort(
    (a, b) => a.sort - b.sort || huCollator.compare(a.familyName, b.familyName),
  );
  const rows = all.filter((p) => matches(q, p.familyName, p.givenName, p.roleTitle));
  const nameOf = (p: (typeof all)[number]) =>
    formatPersonName({
      familyName: p.familyName,
      givenName: p.givenName,
      prefix: p.prefix ?? undefined,
      suffix: p.suffix ?? undefined,
    });

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.staff"))("lead")}
      section="staff"
      breadcrumbs={[{ label: title }]}
      testId="admin-staff"
      actions={<ButtonLink href="/admin/munkatarsak/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters q={q} withState={false} action="/admin/munkatarsak" />
      {rows.length === 0 ? (
        <p className="rounded-md border-2 border-dashed border-border-strong p-6 text-muted">
          {all.length === 0 ? t("empty") : t("emptyFiltered")}
        </p>
      ) : (
        <ReorderList
          caption={t("caption")}
          testId="staff-list"
          disabled={q !== ""}
          onReorder={reorderStaff}
          items={rows.map((p) => ({
            id: p.id,
            name: nameOf(p),
            content: (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/admin/munkatarsak/${p.id}`}
                  className="font-semibold text-primary"
                  data-testid="staff-row-name"
                >
                  {nameOf(p)}
                </Link>
                {p.roleTitle ? <span className="text-muted">{p.roleTitle}</span> : null}
                <Badge>{groups(p.staffGroup)}</Badge>
                {p.isPublic ? <Badge tone="success">{t("public")}</Badge> : null}
                {p.active ? null : <Badge tone="warning">{t("inactive")}</Badge>}
                <span className="ml-auto inline-flex items-center gap-1">
                  <ButtonLink
                    href={`/admin/munkatarsak/${p.id}`}
                    variant="ghost"
                    size="sm"
                    aria-label={list("editItem", { name: nameOf(p) })}
                  >
                    {list("edit")}
                  </ButtonLink>
                  <DeleteButton name={nameOf(p)} onDelete={deleteStaff.bind(null, p.id)} />
                </span>
              </div>
            ),
          }))}
        />
      )}
    </AdminPage>
  );
}

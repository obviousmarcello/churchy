import Link from "next/link";
import { formatAddress } from "@churchy/hu";
import { Badge, ButtonLink } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { ListFilters } from "@/components/admin/content/list-parts";
import { ReorderList } from "@/components/admin/content/reorder-list";
import { getT } from "@/i18n/server";
import { toHuAddress } from "@/lib/locations";
import { deleteLocation, reorderLocations } from "@/server/content-actions";
import { adminData, matches, mayOpen, parseFilters } from "@/server/content-admin";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.locations")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Locations (D-21): in the order of the website, reordered by drag and drop. */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [nav, t, list, kinds] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.locations"),
    getT("admin.content.list"),
    getT("admin.content.locations.kinds"),
  ]);
  const title = nav("sections.locations");
  if (!(await mayOpen("locations"))) return <AdminPage title={title} section="locations" />;

  const { q } = parseFilters(await searchParams);
  const { ctx, repos } = await adminData();
  const all = await repos.locations.list(ctx);
  const rows = all.filter((l) => matches(q, l.name, l.address?.city, l.address?.line1));

  return (
    <AdminPage
      title={title}
      lead={(await getT("admin.sections.locations"))("lead")}
      section="locations"
      breadcrumbs={[{ label: title }]}
      testId="admin-locations"
      actions={<ButtonLink href="/admin/helyszinek/uj">{t("newButton")}</ButtonLink>}
    >
      <ListFilters q={q} withState={false} action="/admin/helyszinek" />
      {rows.length === 0 ? (
        <p className="rounded-md border-2 border-dashed border-border-strong p-6 text-muted">
          {all.length === 0 ? t("empty") : t("emptyFiltered")}
        </p>
      ) : (
        <ReorderList
          caption={t("caption")}
          testId="locations-list"
          disabled={q !== ""}
          onReorder={reorderLocations}
          items={rows.map((l) => ({
            id: l.id,
            name: l.name,
            content: (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/admin/helyszinek/${l.id}`}
                  className="font-semibold text-primary"
                  data-testid="location-row-name"
                >
                  {l.name}
                </Link>
                <Badge>{kinds(l.kind)}</Badge>
                {l.address ? (
                  <span className="text-muted">{formatAddress(toHuAddress(l.address))}</span>
                ) : null}
                <span className="ml-auto inline-flex items-center gap-1">
                  <ButtonLink
                    href={`/admin/helyszinek/${l.id}`}
                    variant="ghost"
                    size="sm"
                    aria-label={list("editItem", { name: l.name })}
                  >
                    {list("edit")}
                  </ButtonLink>
                  <DeleteButton name={l.name} onDelete={deleteLocation.bind(null, l.id)} />
                </span>
              </div>
            ),
          }))}
        />
      )}
    </AdminPage>
  );
}

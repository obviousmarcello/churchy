import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { deleteLocation, updateLocation } from "@/server/content-actions";
import { adminData, mayOpen } from "@/server/content-admin";
import { locationFields, locationValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.locations"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a location (D-21). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, t, form] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.locations"),
    getT("admin.content.form"),
  ]);
  const label = nav("sections.locations");
  if (!(await mayOpen("locations"))) return <AdminPage title={label} section="locations" />;

  const { ctx, repos } = await adminData();
  const location = await repos.locations.get(ctx, id);
  if (location === null) notFound();

  return (
    <AdminPage
      title={location.name}
      section="locations"
      breadcrumbs={[{ label, href: "/admin/helyszinek" }, { label: location.name }]}
      testId="admin-location-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <div className="max-w-2xl">
        <Alert tone="info" title={t("editTitle")}>
          <p>{t("hoursNote")}</p>
        </Alert>
      </div>
      <EntityForm
        action={updateLocation.bind(null, id)}
        fields={await locationFields()}
        values={locationValues(location)}
        submitLabel={form("save")}
        cancelHref="/admin/helyszinek"
        testId="location-form"
      />
      <div>
        <DeleteButton
          name={location.name}
          onDelete={deleteLocation.bind(null, id)}
          redirectTo="/admin/helyszinek"
          size="md"
        />
      </div>
    </AdminPage>
  );
}

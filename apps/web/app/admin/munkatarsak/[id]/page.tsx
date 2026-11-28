import { notFound } from "next/navigation";
import { formatPersonName } from "@churchy/hu";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { deleteStaff, updateStaff } from "@/server/content-actions";
import { adminData, mayOpen } from "@/server/content-admin";
import { staffFields, staffValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.staff"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a person of the staff page (D-21). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, form] = await Promise.all([getT("common.nav"), getT("admin.content.form")]);
  const label = nav("sections.staff");
  if (!(await mayOpen("staff"))) return <AdminPage title={label} section="staff" />;

  const { ctx, repos } = await adminData();
  const person = await repos.people.get(ctx, id);
  if (person === null) notFound();
  const name = formatPersonName({
    familyName: person.familyName,
    givenName: person.givenName,
    prefix: person.prefix ?? undefined,
    suffix: person.suffix ?? undefined,
  });

  return (
    <AdminPage
      title={name}
      section="staff"
      breadcrumbs={[{ label, href: "/admin/munkatarsak" }, { label: name }]}
      testId="admin-staff-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <EntityForm
        action={updateStaff.bind(null, id)}
        fields={await staffFields()}
        values={staffValues(person)}
        submitLabel={form("save")}
        cancelHref="/admin/munkatarsak"
        testId="staff-form"
      />
      <div>
        <DeleteButton
          name={name}
          onDelete={deleteStaff.bind(null, id)}
          redirectTo="/admin/munkatarsak"
          size="md"
        />
      </div>
    </AdminPage>
  );
}

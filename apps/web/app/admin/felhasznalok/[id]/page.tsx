import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { memberValues } from "@/lib/admin/users";
import { canServer } from "@/lib/permissions/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { getRequestContext } from "@/server/session";
import { assignableRoles, userFields } from "@/server/user-admin";
import { updateMemberAction } from "@/server/user-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.users"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Change a user's website role, workspace roles and group scope (D-26). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, nav, t] = await Promise.all([params, getT("common.nav"), getT("admin.users")]);
  const label = nav("sections.users");
  if (!(await mayOpen("users"))) return <AdminPage title={t("editTitle")} section="users" />;
  const { ctx, repos } = await adminData();
  const member = await repos.members.get(ctx, id);
  if (member === null) notFound();
  const tenantId = (await getRequestContext()).tenantId ?? "";
  // An administrator may not open an owner (SDD §11.3): the same answer as for a missing user.
  const targetRoles = member.role === null ? [] : [member.role];
  if (!(await canServer("site.users.manage", { tenantId, targetRoles }))) notFound();
  const fields = await userFields({ identity: false, roles: await assignableRoles() });
  return (
    <AdminPage
      title={t("editTitle")}
      lead={t("editLead", { name: member.user.name, email: member.user.email })}
      section="users"
      breadcrumbs={[{ label, href: "/admin/felhasznalok" }, { label: member.user.name }]}
      testId="admin-user-edit"
    >
      <EntityForm
        action={updateMemberAction.bind(null, id)}
        fields={fields}
        values={memberValues(member)}
        submitLabel={t("save")}
        cancelHref="/admin/felhasznalok"
        testId="user-form"
      />
    </AdminPage>
  );
}

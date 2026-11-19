import { Alert } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { memberValues } from "@/lib/admin/users";
import { mayOpen } from "@/server/content-admin";
import { assignableRoles, userFields } from "@/server/user-admin";
import { inviteMemberAction } from "@/server/user-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.users"), getT("common")]);
  return {
    title: `${t("inviteTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Invite a user by e-mail (D-26); the invitation is a mock in the demo. */
export default async function Page() {
  const [nav, t] = await Promise.all([getT("common.nav"), getT("admin.users")]);
  const label = nav("sections.users");
  if (!(await mayOpen("users"))) return <AdminPage title={t("inviteTitle")} section="users" />;
  const fields = await userFields({ identity: true, roles: await assignableRoles() });
  return (
    <AdminPage
      title={t("inviteTitle")}
      lead={t("inviteLead")}
      section="users"
      breadcrumbs={[{ label, href: "/admin/felhasznalok" }, { label: t("inviteTitle") }]}
      testId="admin-user-invite"
    >
      <Alert tone="info" title={t("mockTitle")}>
        <p>{t("mockNote")}</p>
      </Alert>
      <EntityForm
        action={inviteMemberAction}
        fields={fields}
        values={memberValues()}
        submitLabel={t("inviteSubmit")}
        cancelHref="/admin/felhasznalok"
        testId="user-form"
      />
    </AdminPage>
  );
}

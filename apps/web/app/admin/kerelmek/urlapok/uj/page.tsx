import { AdminPage } from "@/components/admin";
import { FormBuilder } from "@/components/admin/requests/form-builder";
import { getT } from "@/i18n/server";
import { mayOpen } from "@/server/content-admin";
import { saveFormDefinition } from "@/server/request-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.requests.forms"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** A new request form (D-28). */
export default async function Page() {
  const [nav, t] = await Promise.all([getT("common.nav"), getT("admin.requests.forms")]);
  const section = nav("sections.requests");
  if (!(await mayOpen("requests"))) return <AdminPage title={section} section="requests" />;

  return (
    <AdminPage
      title={t("newTitle")}
      section="requests"
      breadcrumbs={[
        { label: section, href: "/admin/kerelmek" },
        { label: t("title"), href: "/admin/kerelmek/urlapok" },
        { label: t("newTitle") },
      ]}
      testId="admin-request-form-new"
    >
      <FormBuilder
        action={saveFormDefinition.bind(null, null)}
        values={{
          title: "",
          key: "",
          referencePrefix: "KER",
          notifyEmails: "",
          confirmationText: "",
          retentionDays: "365",
          active: "on",
        }}
        fields={[]}
        keyLocked={false}
        cancelHref="/admin/kerelmek/urlapok"
      />
    </AdminPage>
  );
}

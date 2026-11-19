import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { FormBuilder } from "@/components/admin/requests/form-builder";
import { getT } from "@/i18n/server";
import { draftsFromFields } from "@/lib/requests/builder";
import { ritePath } from "@/lib/pages/public-pages";
import { adminData, mayOpen } from "@/server/content-admin";
import { deleteFormDefinition, saveFormDefinition } from "@/server/request-actions";

type Params = Promise<{ key: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.requests.forms"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a request form in the builder (D-28). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  const [nav, t, rites] = await Promise.all([
    getT("common.nav"),
    getT("admin.requests.forms"),
    getT("public.rites"),
  ]);
  const section = nav("sections.requests");
  if (!(await mayOpen("requests"))) return <AdminPage title={section} section="requests" />;

  const { ctx, repos } = await adminData();
  const form = await repos.requests.getForm(ctx, key);
  if (form === null) notFound();
  const used = (await repos.requests.list(ctx, { formKey: form.key })).length > 0;

  return (
    <AdminPage
      title={form.title}
      lead={t("editTitle")}
      section="requests"
      breadcrumbs={[
        { label: section, href: "/admin/kerelmek" },
        { label: t("title"), href: "/admin/kerelmek/urlapok" },
        { label: form.title },
      ]}
      testId="admin-request-form-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <p>
        <a
          href={`${ritePath(rites, form.key)}/bejelentes`}
          className="font-semibold text-primary underline"
        >
          {t("preview")}
        </a>
      </p>
      <FormBuilder
        action={saveFormDefinition.bind(null, form.key)}
        values={{
          title: form.title,
          key: form.key,
          referencePrefix: form.referencePrefix,
          notifyEmails: form.notifyEmails.join(", "),
          confirmationText: form.confirmationText,
          retentionDays: String(form.retentionDays),
          active: form.active ? "on" : "",
        }}
        fields={draftsFromFields(form.fields)}
        keyLocked
        cancelHref="/admin/kerelmek/urlapok"
      />
      <div>
        {used ? (
          <p className="text-fs-3 text-muted">{t("deleteBlocked")}</p>
        ) : (
          <DeleteButton
            name={form.title}
            onDelete={deleteFormDefinition.bind(null, form.id)}
            redirectTo="/admin/kerelmek/urlapok"
            size="md"
          />
        )}
      </div>
    </AdminPage>
  );
}

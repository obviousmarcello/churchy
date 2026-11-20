import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { PublishSection } from "@/components/admin/content/publish-section";
import { getT } from "@/i18n/server";
import { publishState } from "@/lib/admin/content";
import { deletePage, publishPage, unpublishPage, updatePage } from "@/server/content-actions";
import { adminData, canInChurch, mayOpen } from "@/server/content-admin";
import { pageFields, pageValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.pages"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a page (D-21) with its publishing panel (D-20). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, form] = await Promise.all([getT("common.nav"), getT("admin.content.form")]);
  const label = nav("sections.pages");
  if (!(await mayOpen("pages"))) return <AdminPage title={label} section="pages" />;

  const { ctx, repos, now } = await adminData();
  const pages = await repos.pages.list(ctx);
  const page = pages.find((p) => p.id === id);
  if (page === undefined) notFound();
  const state = publishState(page, now);

  return (
    <AdminPage
      title={page.title}
      section="pages"
      breadcrumbs={[{ label, href: "/admin/oldalak" }, { label: page.title }]}
      testId="admin-page-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <PublishSection
        state={state}
        at={page.publishedAt}
        scheduling
        canPublish={await canInChurch("page.publish")}
        previewHref={`/admin/oldalak/${id}/elonezet`}
        liveHref={`/${page.slug}`}
        onPublish={publishPage.bind(null, id)}
        onUnpublish={unpublishPage.bind(null, id)}
      />
      <EntityForm
        action={updatePage.bind(null, id)}
        fields={await pageFields(pages, id)}
        values={pageValues(page)}
        submitLabel={form("save")}
        cancelHref="/admin/oldalak"
        testId="page-form"
      />
      <div>
        <DeleteButton
          name={page.title}
          onDelete={deletePage.bind(null, id)}
          redirectTo="/admin/oldalak"
          size="md"
        />
      </div>
    </AdminPage>
  );
}

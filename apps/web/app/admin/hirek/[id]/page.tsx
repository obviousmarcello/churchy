import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { PublishSection } from "@/components/admin/content/publish-section";
import { getT } from "@/i18n/server";
import { publishState } from "@/lib/admin/content";
import { deleteNews, publishNews, unpublishNews, updateNews } from "@/server/content-actions";
import { adminData, canInChurch, mayOpen } from "@/server/content-admin";
import { newsFields, newsValues } from "@/server/content-fields";

type Params = Promise<{ id: string }>;

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.news"), getT("common")]);
  return {
    title: `${t("editTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Edit a news post (D-21) with its publishing panel (D-20). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [nav, form] = await Promise.all([getT("common.nav"), getT("admin.content.form")]);
  const label = nav("sections.news");
  if (!(await mayOpen("news"))) return <AdminPage title={label} section="news" />;

  const { ctx, repos, now } = await adminData();
  const post = await repos.news.get(ctx, id);
  if (post === null) notFound();
  const state = publishState(post, now);

  return (
    <AdminPage
      title={post.title}
      section="news"
      breadcrumbs={[{ label, href: "/admin/hirek" }, { label: post.title }]}
      testId="admin-news-edit"
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <PublishSection
        state={state}
        at={state === "expired" ? post.expiresAt : post.publishedAt}
        scheduling
        canPublish={await canInChurch("news.publish")}
        previewHref={`/admin/hirek/${id}/elonezet`}
        liveHref={`/hirek/${post.slug}`}
        onPublish={publishNews.bind(null, id)}
        onUnpublish={unpublishNews.bind(null, id)}
      />
      <EntityForm
        action={updateNews.bind(null, id)}
        fields={await newsFields()}
        values={newsValues(post)}
        submitLabel={form("save")}
        cancelHref="/admin/hirek"
        testId="news-form"
      />
      <div>
        <DeleteButton
          name={post.title}
          onDelete={deleteNews.bind(null, id)}
          redirectTo="/admin/hirek"
          size="md"
        />
      </div>
    </AdminPage>
  );
}

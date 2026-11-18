import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { PreviewFrame } from "@/components/admin/content/preview-frame";
import { NewsArticleBody } from "@/components/news/news-article";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.preview"), getT("common")]);
  return {
    title: `${t("title")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Preview of a (draft) news post with the public template (D-20). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const label = (await getT("common.nav"))("sections.news");
  if (!(await mayOpen("news"))) return <AdminPage title={label} section="news" />;
  const { ctx, repos } = await adminData();
  const post = await repos.news.get(ctx, id);
  if (post === null) notFound();
  return (
    <PreviewFrame
      title={post.title}
      section="news"
      editHref={`/admin/hirek/${id}`}
      breadcrumbs={[
        { label, href: "/admin/hirek" },
        { label: post.title, href: `/admin/hirek/${id}` },
        { label: (await getT("admin.content.preview"))("title") },
      ]}
    >
      <NewsArticleBody post={post} />
    </PreviewFrame>
  );
}

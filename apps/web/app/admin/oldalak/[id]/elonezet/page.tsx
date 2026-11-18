import { notFound } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { PreviewFrame } from "@/components/admin/content/preview-frame";
import { PublicBlocks } from "@/components/pages/public-blocks";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.preview"), getT("common")]);
  return {
    title: `${t("title")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Preview of a (draft) page with the public block renderer (D-20). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nav, preview] = await Promise.all([getT("common.nav"), getT("admin.content.preview")]);
  const label = nav("sections.pages");
  if (!(await mayOpen("pages"))) return <AdminPage title={label} section="pages" />;
  const { ctx, repos } = await adminData();
  const page = await repos.pages.get(ctx, id);
  if (page === null) notFound();
  return (
    <PreviewFrame
      title={page.title}
      section="pages"
      editHref={`/admin/oldalak/${id}`}
      breadcrumbs={[
        { label, href: "/admin/oldalak" },
        { label: page.title, href: `/admin/oldalak/${id}` },
        { label: preview("title") },
      ]}
    >
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{page.title}</h1>
      <PublicBlocks blocks={page.blocks} className="max-w-prose" />
    </PreviewFrame>
  );
}

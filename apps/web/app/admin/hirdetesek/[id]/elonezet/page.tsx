import { notFound } from "next/navigation";
import { FormattedDate } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { PreviewFrame } from "@/components/admin/content/preview-frame";
import { RichBody } from "@/components/announcements/rich-body";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.preview"), getT("common")]);
  return {
    title: `${t("title")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Preview of a (draft) weekly announcement with the public body renderer (D-20). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [label, preview] = await Promise.all([getT("common.nav"), getT("admin.content.preview")]);
  const title = label("sections.announcements");
  if (!(await mayOpen("announcements"))) return <AdminPage title={title} section="announcements" />;
  const { ctx, repos } = await adminData();
  const row = await repos.announcements.get(ctx, id);
  if (row === null) notFound();
  return (
    <PreviewFrame
      title={row.weekSunday}
      section="announcements"
      editHref={`/admin/hirdetesek/${id}`}
      breadcrumbs={[
        { label: title, href: "/admin/hirdetesek" },
        { label: row.weekSunday, href: `/admin/hirdetesek/${id}` },
        { label: preview("title") },
      ]}
    >
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
        <FormattedDate value={row.weekSunday} />
      </h1>
      {row.body ? <RichBody doc={row.body} /> : null}
    </PreviewFrame>
  );
}

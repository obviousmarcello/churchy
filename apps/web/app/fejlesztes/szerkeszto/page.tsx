import { AdminScope, Alert, PageShell } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import { loadMediaLibrary } from "../media/actions";
import { EditorDemo } from "./editor-demo";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("dev.editor"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

// HIDE_DEV_ROUTES is read at runtime and the picker reads the visitor's demo media library.
export const dynamic = "force-dynamic";

export default async function EditorDemoPage() {
  assertDevRoutesVisible();
  const [t, common] = await Promise.all([getT("dev.editor"), getT("common")]);
  const initialMedia = await loadMediaLibrary();
  return (
    <AdminScope>
      <PageShell skipLinkLabel={common("skipToContent")}>
        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-10">
          <header>
            <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-[68ch] text-fs-4">{t("lead")}</p>
            <Alert tone="info" className="mt-6">
              {t("devNotice")}
            </Alert>
          </header>
          <div className="mt-8">
            <EditorDemo initialMedia={initialMedia} />
          </div>
        </div>
      </PageShell>
    </AdminScope>
  );
}

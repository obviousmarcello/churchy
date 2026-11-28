import { notFound } from "next/navigation";
import { DraftReview } from "@/components/platform/site-builder/draft-review";
import { getT } from "@/i18n/server";
import { canServer } from "@/lib/permissions/server";
import { getActor } from "@/server/session";
import { draftStoreFor, siteBuilderMode } from "@/server/site-builder-run";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("platform.siteBuilder.review"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Review of one draft (operators only). */
export default async function DraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  if (!(await canServer("platform.siteBuilder.use", { kind: "platform" }))) notFound();
  const { draftId } = await params;
  const actor = await getActor();
  const store = draftStoreFor(siteBuilderMode(), actor.kind === "platform" ? actor.userId : "");
  const row = store ? await store.get(draftId) : null;
  if (!row || row.status !== "ready") notFound();
  const t = await getT("platform.siteBuilder.review");
  return (
    <div className="mx-auto grid w-full max-w-(--content-max) gap-6 px-(--gutter) py-10">
      <header>
        <h1 className="m-0 font-heading text-fs-7 font-bold text-primary">{t("title")}</h1>
        <p className="mt-3 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      </header>
      <DraftReview
        draftId={row.id}
        draft={row.draft}
        existingChurch={row.targetTenantId !== null}
      />
    </div>
  );
}

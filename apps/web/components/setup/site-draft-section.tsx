import { getT } from "@/i18n/server";
import { SiteDraftApply } from "./site-draft-apply";

/** Drafts the platform operator prepared for this church; the owner applies them (additive only). */
export async function SiteDraftSection({
  drafts,
}: {
  drafts: readonly { id: string; sourceUrl: string; expiresAt: string }[];
}) {
  if (drafts.length === 0) return null;
  const t = await getT("platform.siteBuilder.owner");
  return (
    <section aria-labelledby="site-drafts" className="grid gap-4" data-testid="owner-drafts">
      <h2 id="site-drafts" className="m-0 text-fs-5 font-semibold">
        {t("title")}
      </h2>
      <p className="m-0 max-w-prose text-muted">{t("lead")}</p>
      <ul className="m-0 grid list-none gap-4 p-0">
        {drafts.map((d) => (
          <li
            key={d.id}
            className="grid gap-2 rounded-card bg-surface-raised p-4 ring-1 ring-hairline"
          >
            <p className="m-0">{t("source", { url: d.sourceUrl })}</p>
            <p className="m-0 text-fs-2 text-muted">
              {t("expires", {
                when: new Date(d.expiresAt).toLocaleString("hu-HU", {
                  timeZone: "Europe/Budapest",
                }),
              })}
            </p>
            <SiteDraftApply draftId={d.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

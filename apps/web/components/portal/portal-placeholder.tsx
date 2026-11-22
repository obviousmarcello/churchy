import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { canOpenOrgSection } from "@/server/org-nav";

/**
 * Stand-in for a portal section whose deliverable has not been built (*Sablonok*: D-86;
 * *Portál munkatársai*). The route and the permission check are final; the section's deliverable
 * replaces the body. A section the actor may not open is a 404.
 */
export async function PortalPlaceholder({ section }: { section: "orgTemplates" | "orgMembers" }) {
  if (!(await canOpenOrgSection(section))) notFound();
  const [nav, t] = await Promise.all([getT("common.nav"), getT("portal.placeholder")]);
  const title = nav(`sections.${section}`);
  return (
    <div className="flex flex-col gap-4" data-testid="portal-placeholder" data-section={section}>
      <h1 className="font-heading text-page-title [font-weight:var(--fw-heading)] tracking-(--heading-tracking) text-balance text-primary">
        {title}
      </h1>
      <Alert tone="info" title={t("title")}>
        <p>{t(section)}</p>
      </Alert>
    </div>
  );
}

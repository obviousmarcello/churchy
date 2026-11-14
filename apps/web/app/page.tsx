import { Hero, PageShell } from "@churchy/ui";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";

export default async function HomePage() {
  const t = await getT("public.home");
  const common = await getT("common");
  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <Hero variant="text-only" title={t("placeholderTitle")} lead={t("placeholderLead")} />
    </PageShell>
  );
}

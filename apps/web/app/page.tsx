import { Hero, PageShell } from "@churchy/ui";
import messages from "@messages/hu.json";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  const t = messages.public.home;
  return (
    <PageShell skipLinkLabel={messages.common.skipToContent} header={<SiteHeader />}>
      <Hero variant="text-only" title={t.placeholderTitle} lead={t.placeholderLead} />
    </PageShell>
  );
}

import { Hero, PageShell } from "@churchy/ui";
import messages from "@messages/hu.json";

export default function HomePage() {
  const t = messages.public.home;
  return (
    <PageShell skipLinkLabel={messages.common.skipToContent}>
      <Hero variant="text-only" title={t.placeholderTitle} lead={t.placeholderLead} />
    </PageShell>
  );
}

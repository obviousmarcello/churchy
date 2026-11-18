import { SectionPlaceholder } from "@/components/admin";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.schedule")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Placeholder until the section's module arrives; replace the body, keep `<AdminPage section>`. */
export default function Page() {
  return <SectionPlaceholder section="schedule" />;
}

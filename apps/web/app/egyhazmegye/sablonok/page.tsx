import { PortalPlaceholder } from "@/components/portal/portal-placeholder";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgTemplates")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** *Sablonok* — versioned HR category templates arrive with D-86. */
export default function Page() {
  return <PortalPlaceholder section="orgTemplates" />;
}

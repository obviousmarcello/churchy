import { PortalPlaceholder } from "@/components/portal/portal-placeholder";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.orgMembers")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** *Portál munkatársai* — managing diocesan members and scopes is not part of D-85. */
export default function Page() {
  return <PortalPlaceholder section="orgMembers" />;
}

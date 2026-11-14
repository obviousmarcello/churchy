import { AreaHome } from "@/components/area-home";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("portal.home"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Egyházmegyei portál* — diocesan HR portal landing page; its sections are filtered with `can()`. */
export default async function PortalHomePage() {
  const t = await getT("portal.home");
  return <AreaHome area="organization" title={t("title")} lead={t("lead")} />;
}

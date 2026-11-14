import { AreaHome } from "@/components/area-home";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.home"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Munkatér* — workspace landing page; its sections are filtered with `can()`. */
export default async function WorkspaceHomePage() {
  const t = await getT("munkater.home");
  return <AreaHome area="workspace" title={t("title")} lead={t("lead")} />;
}

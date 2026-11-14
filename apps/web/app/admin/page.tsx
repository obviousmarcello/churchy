import { AreaHome } from "@/components/area-home";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.dashboard"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Weboldal kezelése* — admin landing page; its sections are filtered with `can()`. */
export default async function AdminHomePage() {
  const t = await getT("admin.dashboard");
  return <AreaHome area="admin" title={t("title")} lead={t("lead")} />;
}

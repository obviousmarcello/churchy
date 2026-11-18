import { notFound } from "next/navigation";
import { NavigationEditor } from "@/components/appearance/navigation-editor";
import { getT } from "@/i18n/server";
import { themeFromSiteTheme } from "@/lib/site-config";
import { getPublicSite } from "@/server/public-seo";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.appearance.navigation"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Menü*: the navigation editor. */
export default async function NavigationPage() {
  const [site, t] = await Promise.all([getPublicSite(), getT("admin.appearance.navigation")]);
  if (site === null) notFound();
  const { config } = site;
  return (
    <section aria-labelledby="nav-heading" className="grid gap-6">
      <h2 id="nav-heading" className="font-heading text-fs-5 font-semibold">
        {t("title")}
      </h2>
      <NavigationEditor initial={config.navigation} theme={themeFromSiteTheme(config.theme)} />
    </section>
  );
}

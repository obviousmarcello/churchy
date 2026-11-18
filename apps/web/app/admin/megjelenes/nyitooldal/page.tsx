import { notFound } from "next/navigation";
import { HomeComposer } from "@/components/appearance/home-composer";
import { getT } from "@/i18n/server";
import { themeFromSiteTheme } from "@/lib/site-config";
import { getPublicSite } from "@/server/public-seo";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.appearance.home"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Nyitóoldal*: the home composer. */
export default async function HomeComposerPage() {
  const [site, t] = await Promise.all([getPublicSite(), getT("admin.appearance.home")]);
  if (site === null) notFound();
  const { config } = site;
  return (
    <section aria-labelledby="home-heading" className="grid gap-6">
      <div>
        <h2 id="home-heading" className="font-heading text-fs-5 font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-muted">{t("lead")}</p>
      </div>
      <HomeComposer
        initial={config.home}
        modules={config.modules}
        theme={themeFromSiteTheme(config.theme)}
      />
    </section>
  );
}

import { notFound } from "next/navigation";
import { BrandingForm } from "@/components/appearance/branding-form";
import { getT } from "@/i18n/server";
import { getPublicSite } from "@/server/public-seo";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.appearance.branding"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Arculat*: name, tagline, theme, colours, fonts, hero style and radius with a live preview. */
export default async function BrandingPage() {
  const [site, t] = await Promise.all([getPublicSite(), getT("admin.appearance.branding")]);
  if (site === null) notFound();
  const { config } = site;
  return (
    <section aria-labelledby="branding-heading" className="grid gap-6">
      <div>
        <h2 id="branding-heading" className="font-heading text-fs-5 font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-muted">{t("lead")}</p>
      </div>
      <BrandingForm
        initial={{
          name: config.identity.name,
          shortName: config.identity.shortName,
          tagline: config.identity.tagline ?? "",
          theme: config.theme,
        }}
        navLabels={config.navigation.map((n) => n.label)}
      />
    </section>
  );
}

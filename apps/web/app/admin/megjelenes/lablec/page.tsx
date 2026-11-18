import { notFound } from "next/navigation";
import { FooterEditor } from "@/components/appearance/navigation-editor";
import { getT } from "@/i18n/server";
import { getPublicSite } from "@/server/public-seo";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.appearance.footer"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Lábléc*: footer links and the diocese link. */
export default async function FooterPage() {
  const [site, t] = await Promise.all([getPublicSite(), getT("admin.appearance.footer")]);
  if (site === null) notFound();
  const { footer } = site.config;
  return (
    <section aria-labelledby="footer-heading" className="grid gap-6">
      <h2 id="footer-heading" className="font-heading text-fs-5 font-semibold">
        {t("title")}
      </h2>
      <FooterEditor
        initial={{
          showMap: footer.showMap,
          links: footer.links,
          dioceseLink: footer.dioceseLink ?? null,
        }}
      />
    </section>
  );
}

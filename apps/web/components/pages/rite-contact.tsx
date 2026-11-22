import type { Tenant } from "@churchy/contracts";
import { Phone, SectionHeading } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { CONTACT_PATH } from "@/lib/seo";
import { getSiteHref } from "@/server/site-base";

/** *Kapcsolat* section of the rite pages (SDD §7.4): the office phone and the contact page. */
export async function RiteContact({ tenant }: { tenant: Tenant }) {
  const [t, href] = await Promise.all([getT("public.rites"), getSiteHref()]);
  const phone = tenant.siteConfig.contact?.phone;
  return (
    <section aria-labelledby="rite-contact" className="flex max-w-prose flex-col gap-3">
      <SectionHeading id="rite-contact" title={t("contactHeading")} />
      <p className="text-fs-4">{t("contactBody")}</p>
      <p className="flex flex-wrap gap-x-6 gap-y-2 text-fs-4">
        {phone ? (
          <Phone value={phone} link className="font-semibold text-primary underline" />
        ) : null}
        <a href={href(CONTACT_PATH)} className="font-semibold text-primary underline">
          {t("contactLink")}
        </a>
      </p>
    </section>
  );
}

import type { Metadata } from "next";
import { OpeningHoursSchema, type GeoPoint, type Location } from "@churchy/contracts";
import { Address, PageShell, Phone, SectionHeading } from "@churchy/ui";
import { ContactForm } from "@/components/public/contact-form";
import { RouteLinks } from "@/components/public/location-access";
import { LocationList } from "@/components/public/location-list";
import { MapFacade } from "@/components/public/map-facade";
import { OpeningHours } from "@/components/public/opening-hours";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { toHuAddress } from "@/lib/locations";
import { getPublicCtx } from "@/server/public-site";
import { getRequestRepositories } from "@/server/repositories";
import { sendContactMessage } from "./actions";

/** Privacy notice (SDD §6 legal pages). */
const PRIVACY_PATH = "/adatkezeles";

async function load() {
  const [{ tenants, locations }, ctx] = await Promise.all([
    getRequestRepositories(),
    getPublicCtx(),
  ]);
  const [tenant, list] = await Promise.all([tenants.current(ctx), locations.list(ctx)]);
  return { tenant, locations: list };
}

export async function generateMetadata(): Promise<Metadata> {
  const [{ tenant }, t] = await Promise.all([load(), getT("public.contact")]);
  return { title: tenant ? `${t("title")} · ${tenant.name}` : t("title") };
}

/** *Kapcsolat* (FR-008, SDD §7.5, D-12): contact details, office hours, map and contact form. */
export default async function ContactPage() {
  const [{ tenant, locations }, t, common] = await Promise.all([
    load(),
    getT("public.contact"),
    getT("common"),
  ]);
  const contact = tenant?.siteConfig.contact ?? {};
  const officeHours = OpeningHoursSchema.parse(contact.officeHours ?? {});
  const mapped = locations.find((l): l is Location & { geo: GeoPoint } => l.geo !== null);

  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader />}>
      <div className="mx-auto grid w-full max-w-(--content-max) gap-12 px-(--gutter) py-10">
        <header className="grid gap-3">
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
        </header>

        <div className="grid gap-12 lg:grid-cols-2">
          <section aria-labelledby="contact-details" className="grid content-start gap-4">
            <SectionHeading id="contact-details" title={t("detailsHeading")} />
            <dl className="grid gap-3 text-fs-3" data-testid="contact-details">
              {contact.address ? (
                <div>
                  <dt className="font-semibold">{t("address")}</dt>
                  <dd>
                    <Address address={toHuAddress(contact.address)} />
                  </dd>
                </div>
              ) : null}
              {contact.phone ? (
                <div>
                  <dt className="font-semibold">{t("phone")}</dt>
                  <dd>
                    <Phone value={contact.phone} link className="text-primary underline" />
                  </dd>
                </div>
              ) : null}
              {contact.email ? (
                <div>
                  <dt className="font-semibold">{t("email")}</dt>
                  <dd>
                    <a href={`mailto:${contact.email}`} className="text-primary underline">
                      {contact.email}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            {mapped ? (
              <>
                <RouteLinks location={mapped} />
                <MapFacade name={mapped.name} geo={mapped.geo} />
              </>
            ) : null}
          </section>

          <section aria-labelledby="office-hours" className="grid content-start gap-4">
            <SectionHeading id="office-hours" title={t("officeHoursHeading")} />
            <OpeningHours hours={officeHours} testId="office-hours" />
          </section>
        </div>

        <section aria-labelledby="contact-form-heading" className="grid gap-4">
          <SectionHeading id="contact-form-heading" title={t("form.heading")} />
          <ContactForm action={sendContactMessage} privacyHref={PRIVACY_PATH} />
        </section>

        {locations.length > 0 ? (
          <section aria-labelledby="contact-locations" className="grid gap-4">
            <SectionHeading id="contact-locations" title={t("locationsHeading")} />
            <LocationList locations={locations} headingLevel={3} />
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

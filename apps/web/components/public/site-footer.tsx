import { OpeningHoursSchema } from "@churchy/contracts";
import { formatTimeRange, todayInBudapest, weekdayName } from "@churchy/hu";
import {
  Address,
  Footer,
  FooterLink,
  ObfuscatedEmail,
  Phone,
  encodeEmail,
  type FooterColumn,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import { LEGAL_PATHS, officeHoursSummary, socialLinks, type HoursGroup } from "@/lib/footer";
import { toHuAddress } from "@/lib/locations";
import { CONTACT_PATH } from "@/lib/seo";
import { termRoutePath } from "@/lib/term-routes";
import { getPublicSite } from "@/server/public-seo";
import { SOCIAL_ICONS } from "./social-icons";

const day = (weekday: number) => weekdayName(weekday, { capitalize: true });
const daysOf = (g: HoursGroup) => (g.from === g.to ? day(g.from) : `${day(g.from)}–${day(g.to)}`);

/**
 * Footer of every public page (FR-109, SDD §7.1, D-17): the church's contact details, an
 * office-hours summary (the full table with exceptions is on the contact page), further links
 * (support page, diocese), social profiles as inline icons, and the legal links. Rendered by the
 * public layout; hidden when printing.
 */
export async function SiteFooter() {
  const [site, t, common, staff] = await Promise.all([
    getPublicSite(),
    getT("public.footer"),
    getT("common"),
    getT("public.staff"),
  ]);
  if (site === null) return null;
  const { tenant, config } = site;
  const { contact } = config;
  const hours = officeHoursSummary(OpeningHoursSchema.parse(contact.officeHours ?? {}));
  const social = socialLinks(config.integrations);
  const year = todayInBudapest(new Date()).slice(0, 4);

  const columns: FooterColumn[] = [
    {
      heading: t("contactHeading"),
      children: (
        <address className="grid gap-1 not-italic" data-testid="footer-contact">
          {contact.address ? <Address address={toHuAddress(contact.address)} /> : null}
          {contact.phone ? (
            <span>
              <Phone
                value={contact.phone}
                link
                className="inline-flex min-h-11 items-center text-inverse-text underline decoration-inverse-muted/60 underline-offset-4 hover:decoration-inverse-accent"
              />
            </span>
          ) : null}
          {contact.email ? (
            <span className="inline-flex min-h-11 items-center">
              {/* Not machine-readable in the server HTML, like the staff page (D-16). */}
              <ObfuscatedEmail
                code={encodeEmail(contact.email)}
                atWord={staff("emailAt")}
                dotWord={staff("emailDot")}
                className="text-inverse-text!"
              />
            </span>
          ) : null}
        </address>
      ),
    },
    {
      heading: t("hoursHeading"),
      children: (
        <div className="grid gap-2" data-testid="footer-hours">
          {hours.length === 0 ? (
            <p>{t("noHours")}</p>
          ) : (
            <ul className="grid gap-1">
              {hours.map((g) => (
                <li key={g.from} className="tabular-nums" data-testid="footer-hours-row">
                  {t("hoursRow", {
                    days: daysOf(g),
                    hours: g.intervals.map((i) => formatTimeRange(i.from, i.to)).join(", "),
                  })}
                </li>
              ))}
            </ul>
          )}
          <FooterLink href={CONTACT_PATH}>{t("allHours")}</FooterLink>
        </div>
      ),
    },
    {
      heading: t("linksHeading"),
      children: (
        <div className="grid gap-4">
          <ul className="grid" data-testid="footer-links">
            {config.modules.giving ? (
              <li>
                <FooterLink href={termRoutePath(t, "givingSection")}>{t("support")}</FooterLink>
              </li>
            ) : null}
            <li>
              <FooterLink href={CONTACT_PATH}>{t("contact")}</FooterLink>
            </li>
            {config.footer.dioceseLink ? (
              <li>
                <FooterLink href={config.footer.dioceseLink.url} rel="noopener noreferrer">
                  {config.footer.dioceseLink.label}
                </FooterLink>
              </li>
            ) : null}
          </ul>
          {social.length > 0 ? (
            <ul
              className="-ml-2.5 flex flex-wrap gap-1"
              aria-label={t("followHeading")}
              data-testid="footer-social"
            >
              {social.map(({ network, href }) => {
                const Icon = SOCIAL_ICONS[network];
                return (
                  <li key={network}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t(`social.${network}`)} ${t("opensInNewTab")}`}
                      data-network={network}
                      className="inline-flex size-11 items-center justify-center rounded-md text-inverse-text hover:text-inverse-accent"
                    >
                      <Icon />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="print:hidden" data-testid="site-footer">
      <Footer
        brand={{
          name: tenant.name,
          ...(config.identity.tagline ? { description: config.identity.tagline } : {}),
        }}
        columns={columns}
        legal={[
          { label: t("impresszum"), href: LEGAL_PATHS.impresszum },
          { label: t("privacy"), href: LEGAL_PATHS.privacy },
        ]}
        legalLabel={common("legalNavigation")}
        note={t("copyright", { year, name: tenant.name })}
      />
    </div>
  );
}

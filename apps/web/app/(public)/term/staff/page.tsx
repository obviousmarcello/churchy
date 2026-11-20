import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  ObfuscatedEmail,
  PageShell,
  PersonName,
  Phone,
  SectionHeading,
  encodeEmail,
} from "@churchy/ui";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/i18n/server";
import { groupStaff } from "@/lib/pages/public-pages";
import { TERM_ROUTE_HEADER, termRoutePath } from "@/lib/term-routes";
import { getPublicSite, listPublicStaff } from "@/server/public-pages";

/**
 * *Munkatársaink* (FR-009, SDD §7.5, D-16): the people a church marked public, grouped as clergy,
 * staff and council (then volunteers), each in the church's own order. Names are family name
 * first (`<PersonName>`); only contact fields whose visibility is `public` arrive from the
 * repository. Emails are obfuscated (never a plain address or `mailto:` in the server HTML),
 * phones are `tel:` links.
 *
 * Reached through the tenant's term slug (`/munkatarsaink`), which the proxy rewrites to this
 * internal route (`lib/term-routes.ts`).
 */

export async function generateMetadata(): Promise<Metadata> {
  const [t, site] = await Promise.all([getT("public.staff"), getPublicSite()]);
  return {
    title: t("metaTitle", { church: site?.tenant.name ?? "" }),
    alternates: { canonical: termRoutePath(t, "staffSection") },
  };
}

export default async function StaffPage() {
  if ((await headers()).get(TERM_ROUTE_HEADER) !== "staffSection") notFound();
  const [site, t, common] = await Promise.all([
    getPublicSite(),
    getT("public.staff"),
    getT("common"),
  ]);
  if (site === null || !site.config.modules.staff) notFound();
  const groups = groupStaff(await listPublicStaff());
  const path = termRoutePath(t, "staffSection");

  return (
    <PageShell skipLinkLabel={common("skipToContent")} header={<SiteHeader currentHref={path} />}>
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-12 px-(--gutter) py-10">
        <header className="flex max-w-prose flex-col gap-3">
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="text-fs-4 text-muted">{t("lead")}</p>
        </header>

        {groups.length === 0 ? <p className="text-fs-4">{t("empty")}</p> : null}

        {groups.map(({ group, people }) => (
          <section
            key={group}
            aria-labelledby={`staff-${group}`}
            className="flex flex-col gap-5"
            data-testid={`staff-group-${group}`}
          >
            <SectionHeading id={`staff-${group}`} title={t(`groups.${group}`)} />
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-col gap-3 rounded-md border-2 border-border bg-surface-raised p-5"
                  data-testid="staff-person"
                >
                  <div className="flex flex-col gap-1">
                    <h3 className="font-heading text-fs-5 leading-tight font-bold">
                      <PersonName
                        name={{
                          familyName: person.familyName,
                          givenName: person.givenName,
                          prefix: person.prefix ?? undefined,
                          suffix: person.suffix ?? undefined,
                        }}
                        data-testid="staff-name"
                      />
                    </h3>
                    {person.roleTitle ? (
                      <p className="text-fs-3 text-muted" data-testid="staff-role">
                        {person.roleTitle}
                      </p>
                    ) : null}
                  </div>
                  {person.email || person.phone ? (
                    <dl className="grid gap-1 text-fs-3">
                      {person.email ? (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-semibold">{t("email")}</dt>
                          <dd data-testid="staff-email">
                            <ObfuscatedEmail
                              code={encodeEmail(person.email)}
                              atWord={t("emailAt")}
                              dotWord={t("emailDot")}
                            />
                          </dd>
                        </div>
                      ) : null}
                      {person.phone ? (
                        <div className="flex flex-wrap gap-x-2">
                          <dt className="font-semibold">{t("phone")}</dt>
                          <dd>
                            <Phone
                              value={person.phone}
                              link
                              className="text-primary underline"
                              data-testid="staff-phone"
                            />
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="max-w-prose text-fs-3">
          {t("officeHint")}{" "}
          <a href="/kapcsolat" className="font-semibold text-primary underline">
            {t("contactLink")}
          </a>
        </p>
      </div>
    </PageShell>
  );
}

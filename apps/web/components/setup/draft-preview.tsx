"use client";

import { useMemo, type CSSProperties } from "react";
import { weekdayName } from "@churchy/hu";
import { themeToCssVars } from "@churchy/themes";
import { Address, Card, FormattedTime, Hero, Phone, SectionHeading, cn } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { draftConfig, includedStaff, type SetupDraft } from "@/lib/setup/draft";
import { storedThemeToConfig } from "@/lib/site-config";

/** A neutral picture for the image hero variants: the theme's colours as soft shapes. */
const HERO_IMAGE = {
  src: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><rect width="800" height="500" fill="#d9dde3"/><path d="M0 380 260 180l180 140 120-90 240 190v80H0z" fill="#b9c0ca"/><circle cx="620" cy="110" r="46" fill="#eef0f3"/></svg>',
  )}`,
  alt: "",
  width: 800,
  height: 500,
};

/**
 * The type scale and gutter of the miniature: the shared components size their text for a full
 * page, so the preview scales the tokens down instead of overflowing its narrow column.
 */
const MINIATURE = {
  "--fs-1": "0.65rem",
  "--fs-2": "0.75rem",
  "--fs-3": "0.82rem",
  "--fs-4": "0.95rem",
  "--fs-5": "1.05rem",
  "--fs-6": "1.2rem",
  "--fs-7": "1.5rem",
  "--gutter": "1rem",
} as const;

/**
 * The draft public site (step 2), built from the real shared components of `@churchy/ui` and the
 * theme tokens of `@churchy/themes`, with the effective config of the draft (preset terminology,
 * navigation, modules). It is a faithful miniature, not a screenshot: every edit on the left shows
 * here at once. Decorative for assistive technology (`aria-hidden`, `inert`); the editable summary
 * next to it is the accessible version of the same content.
 */
export function DraftPreview({ draft }: { draft: SetupDraft }) {
  const t = useT("admin.setup.preview");
  const config = useMemo(() => draftConfig(draft), [draft]);
  const theme = useMemo(() => storedThemeToConfig(draft.theme), [draft.theme]);
  const terms = config.terminology;
  const people = includedStaff(draft);
  const nav = config.navigation.slice(0, 5);
  const placeName = (id: string | null) => draft.locations.find((l) => l.id === id)?.name;
  const services = [...draft.serviceTimes].sort(
    (a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time),
  );

  return (
    <figure className="m-0" data-testid="draft-preview">
      <figcaption className="mb-2 text-fs-2 font-semibold">{t("caption")}</figcaption>
      <div
        data-theme={theme.themeId}
        data-preview-theme={theme.themeId}
        data-preview-denomination={draft.denomination}
        style={{ ...themeToCssVars(theme), ...MINIATURE } as CSSProperties}
        className="overflow-hidden rounded-lg border border-border-strong bg-surface font-body text-text"
        aria-hidden="true"
        inert
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-surface-raised px-4 py-3">
          <span className="font-heading text-fs-4 font-bold text-primary" data-preview="name">
            {draft.shortName || draft.name}
          </span>
          <span className="flex flex-wrap gap-x-4 text-fs-2" data-preview="nav">
            {nav.map((item) => (
              <span key={item.href}>{item.label}</span>
            ))}
          </span>
        </div>

        <Hero
          variant={theme.heroStyle}
          title={draft.name}
          lead={draft.tagline || undefined}
          eyebrow={terms.community.nom}
          image={theme.heroStyle === "text-only" ? undefined : HERO_IMAGE}
          headingLevel={2}
        />

        <div className="grid gap-6 px-4 py-6">
          {services.length > 0 ? (
            <section data-preview="services">
              <SectionHeading title={terms.serviceSchedule.nom} level={3} />
              <ul className="mt-3 grid gap-2">
                {services.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline gap-x-3 rounded-md bg-surface-raised px-4 py-2 shadow-card"
                  >
                    <span className="font-semibold">{s.label}</span>
                    <span className="text-muted">
                      {weekdayName(s.weekday, { capitalize: true })}{" "}
                      <FormattedTime value={s.time} />
                    </span>
                    {placeName(s.locationId) ? (
                      <span className="text-fs-2 text-muted">{placeName(s.locationId)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {draft.locations.length > 0 ? (
            <section data-preview="locations">
              <SectionHeading title={terms.locationsSection.nom} level={3} />
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {draft.locations.map((l) => (
                  <li key={l.id}>
                    <Card title={l.name} headingLevel={4}>
                      <Address
                        address={{ postalCode: l.postalCode, city: l.city, street: l.line1 }}
                      />
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {people.length > 0 ? (
            <section data-preview="staff">
              <SectionHeading title={terms.staffSection.nom} level={3} />
              <ul className="mt-3 flex flex-wrap gap-4">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-12 place-items-center rounded-full bg-primary-soft text-fs-1 font-bold text-primary",
                      )}
                    >
                      {p.photo ? t("photoMark") : p.name.slice(0, 1)}
                    </span>
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-fs-2 text-muted">{p.role}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="grid gap-1 bg-inverse px-4 py-4 text-fs-2 text-inverse-text">
          <span className="font-semibold">{draft.name}</span>
          {config.contact.phone ? (
            <span className="text-inverse-muted">
              <Phone value={config.contact.phone} />
            </span>
          ) : null}
          {config.contact.email ? (
            <span className="text-inverse-muted">{config.contact.email}</span>
          ) : null}
        </div>
      </div>
    </figure>
  );
}

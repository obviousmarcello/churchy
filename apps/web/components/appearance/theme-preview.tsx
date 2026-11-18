"use client";

import { themeToCssVars, type ThemeConfig } from "@churchy/themes";
import { cn } from "@churchy/ui";
import { useT } from "@/i18n/client";

/**
 * Live preview of a theme (D-24): a miniature public page (header, hero, a card, buttons, footer)
 * drawn with the same tokens and utilities as the real site, scoped by `data-theme` and the
 * config's custom properties, so every change in the editor shows immediately, without a request.
 * Decorative and static: it is hidden from assistive technology except for its label.
 */
export function ThemePreview({
  config,
  name,
  tagline,
  navLabels,
  className,
}: {
  config: ThemeConfig;
  name: string;
  tagline?: string;
  navLabels: readonly string[];
  className?: string;
}) {
  const t = useT("admin.appearance.preview");
  const hero = config.heroStyle;
  return (
    <figure className={cn("m-0", className)} data-testid="theme-preview">
      <figcaption className="mb-2 text-fs-2 font-semibold">{t("caption")}</figcaption>
      <div
        data-theme={config.themeId}
        data-preview-theme={config.themeId}
        style={themeToCssVars(config)}
        className="overflow-hidden rounded-lg border border-border-strong bg-surface text-text"
        aria-hidden="true"
        inert
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-surface-raised px-4 py-3">
          <span className="font-heading text-fs-4 font-bold text-primary">{name}</span>
          <span className="flex flex-wrap gap-x-4 text-fs-2">
            {navLabels.slice(0, 4).map((label) => (
              <span key={label}>{label}</span>
            ))}
          </span>
        </div>

        {hero === "image-full" ? (
          <div className="grid min-h-40 content-end bg-inverse px-4 py-5 text-inverse-text">
            <span className="font-heading text-fs-6 leading-tight">{t("heroTitle")}</span>
            <span className="text-fs-2 text-inverse-muted">{tagline || t("heroText")}</span>
          </div>
        ) : hero === "image-split" ? (
          <div className="grid grid-cols-2 bg-surface-sunken">
            <div className="grid content-center gap-1 px-4 py-5">
              <span className="font-heading text-fs-5 leading-tight">{t("heroTitle")}</span>
              <span className="text-fs-2 text-muted">{tagline || t("heroText")}</span>
            </div>
            <div className="min-h-32 bg-accent" />
          </div>
        ) : (
          <div className="grid gap-1 bg-surface-sunken px-4 py-6">
            <span className="font-heading text-fs-6 leading-tight">{t("heroTitle")}</span>
            <span className="text-fs-2 text-muted">{tagline || t("heroText")}</span>
          </div>
        )}

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="grid gap-2 rounded-md bg-surface-raised p-4 shadow-card">
            <span className="font-heading text-fs-5">{t("cardTitle")}</span>
            <span className="text-fs-2 text-muted">{t("cardText")}</span>
            <span className="text-fs-2 font-semibold text-accent-text underline">
              {t("cardLink")}
            </span>
          </div>
          <div className="grid content-start gap-2">
            <span className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-semibold text-primary-contrast">
              {t("primaryButton")}
            </span>
            <span className="inline-flex min-h-11 items-center justify-center rounded-md border-2 border-primary px-4 font-semibold text-primary">
              {t("secondaryButton")}
            </span>
            <span className="inline-flex w-fit items-center rounded-md bg-accent px-3 py-1 text-fs-2 font-semibold text-accent-contrast">
              {t("badge")}
            </span>
          </div>
        </div>

        <div className="bg-inverse px-4 py-3 text-fs-2 text-inverse-text">
          <span className="font-semibold">{name}</span>
          <span className="ml-3 text-inverse-muted">{t("footerText")}</span>
        </div>
      </div>
    </figure>
  );
}

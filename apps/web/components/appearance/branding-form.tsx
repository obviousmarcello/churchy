"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { THEME_IDS, THEMES, type ThemeId } from "@churchy/themes";
import { Alert, Button, Input, Select, cn } from "@churchy/ui";
import { saveBranding } from "@/app/admin/megjelenes/actions";
import {
  canSaveBranding,
  checkColors,
  selectTheme,
  themeDefaultColors,
  type ColorCheck,
} from "@/lib/appearance/branding";
import { storedThemeToConfig, type StoredTheme } from "@/lib/site-config";
import { useT } from "@/i18n/client";
import { ThemePreview } from "./theme-preview";

type Feedback = { tone: "success" | "danger"; text: string } | null;

const FONT_PAIRINGS: StoredTheme["fontPairing"][] = ["serif-classic", "humanist", "modern-sans"];
const HERO_STYLES: StoredTheme["heroStyle"][] = ["image-full", "image-split", "text-only"];
const RADII: StoredTheme["radius"][] = ["none", "small", "large"];

const ratioText = (ratio: number) =>
  new Intl.NumberFormat("hu-HU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    ratio,
  );

/**
 * Branding and theme editor (FR-103, FR-104, D-24): name and tagline, the three themes, brand
 * colours with a 4.5:1 check that blocks saving and suggests the nearest passing shade, fonts, hero
 * style and corner radius, with a live preview. The server action re-checks everything.
 */
export function BrandingForm({
  initial,
  navLabels,
}: {
  initial: { name: string; shortName: string; tagline: string; theme: StoredTheme };
  navLabels: readonly string[];
}) {
  const t = useT("admin.appearance.branding");
  const [name, setName] = useState(initial.name);
  const [shortName, setShortName] = useState(initial.shortName);
  const [tagline, setTagline] = useState(initial.tagline);
  const [theme, setTheme] = useState(initial.theme);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const checks = useMemo(() => checkColors(theme), [theme]);
  const config = useMemo(() => storedThemeToConfig(theme), [theme]);
  const valid = canSaveBranding(theme) && name.trim() !== "" && shortName.trim() !== "";

  const setColor = (key: "primary" | "secondary", value: string) =>
    setTheme((current) => ({ ...current, colors: { ...current.colors, [key]: value } }));

  function submit() {
    setFeedback(null);
    start(async () => {
      const res = await saveBranding({
        identity: { name: name.trim(), shortName: shortName.trim(), tagline: tagline.trim() },
        theme,
      });
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (res.value.ok) setFeedback({ tone: "success", text: t("saved") });
      else if (res.value.error === "contrast") {
        setFeedback({ tone: "danger", text: t("contrastRefused") });
      } else setFeedback({ tone: "danger", text: t("invalid") });
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <form
        className="grid gap-8"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        <fieldset className="grid gap-4">
          <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("identity")}</legend>
          <Input
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
          />
          <Input
            label={t("shortName")}
            help={t("shortNameHelp")}
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            maxLength={100}
            required
          />
          <Input
            label={t("tagline")}
            optionalLabel={t("optional")}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            maxLength={200}
          />
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("theme")}</legend>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("theme")}>
            {THEME_IDS.map((id) => (
              <ThemeCard
                key={id}
                id={id}
                selected={theme.themeId === id}
                onSelect={() => setTheme((current) => selectTheme(current, id))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-4">
          <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("colors")}</legend>
          <ColorField
            label={t("primary")}
            help={t("primaryHelp")}
            value={theme.colors.primary}
            check={checks.primary}
            onChange={(v) => setColor("primary", v)}
          />
          <ColorField
            label={t("secondary")}
            help={t("secondaryHelp")}
            value={theme.colors.secondary}
            check={checks.secondary}
            onChange={(v) => setColor("secondary", v)}
          />
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const defaults = themeDefaultColors(theme.themeId);
                setTheme((current) => ({ ...current, colors: defaults }));
              }}
            >
              {t("resetColors")}
            </Button>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("shape")}</legend>
          <Select
            label={t("fonts")}
            value={theme.fontPairing}
            onChange={(e) =>
              setTheme({ ...theme, fontPairing: e.target.value as StoredTheme["fontPairing"] })
            }
            options={FONT_PAIRINGS.map((value) => ({ value, label: t(`fontOptions.${value}`) }))}
          />
          <Select
            label={t("hero")}
            value={theme.heroStyle}
            onChange={(e) =>
              setTheme({ ...theme, heroStyle: e.target.value as StoredTheme["heroStyle"] })
            }
            options={HERO_STYLES.map((value) => ({ value, label: t(`heroOptions.${value}`) }))}
          />
          <Select
            label={t("radius")}
            value={theme.radius}
            onChange={(e) =>
              setTheme({ ...theme, radius: e.target.value as StoredTheme["radius"] })
            }
            options={RADII.map((value) => ({ value, label: t(`radiusOptions.${value}`) }))}
          />
        </fieldset>

        <div className="grid gap-3">
          {feedback ? (
            <Alert tone={feedback.tone} role={feedback.tone === "danger" ? "alert" : "status"}>
              {feedback.text}
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!valid || pending}>
              {pending ? t("saving") : t("save")}
            </Button>
            {!valid ? <span className="text-fs-2 text-muted">{t("blocked")}</span> : null}
          </div>
        </div>
      </form>

      <div className="lg:sticky lg:top-6">
        <ThemePreview
          config={config}
          name={shortName.trim() || name.trim()}
          tagline={tagline.trim()}
          navLabels={navLabels}
        />
      </div>
    </div>
  );
}

/** One selectable theme: a swatch strip in the theme's own surface, text and brand colours. */
function ThemeCard({
  id,
  selected,
  onSelect,
}: {
  id: ThemeId;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useT("admin.appearance.branding");
  const theme = THEMES[id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-theme-option={id}
      className={cn(
        "grid min-h-11 gap-2 rounded-md border-2 bg-surface-raised p-3 text-left",
        selected ? "border-primary ring-2 ring-primary" : "border-border-strong hover:border-text",
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-10 overflow-hidden rounded-sm border border-border"
      >
        <span className="flex-[3]" style={{ background: theme.surface }} />
        <span className="flex-[2]" style={{ background: theme.defaults.colors.primary }} />
        <span className="flex-[1]" style={{ background: theme.defaults.colors.accent }} />
      </span>
      <span className="font-semibold">{t(`themeNames.${id}`)}</span>
      <span className="text-fs-2 text-muted">{t(`themeDescriptions.${id}`)}</span>
      {selected ? (
        <span className="text-fs-2 font-semibold text-primary">{t("current")}</span>
      ) : null}
    </button>
  );
}

/**
 * A colour input: native picker plus hex text, the measured contrast and, when the colour fails,
 * the nearest passing shade as a one-click fix.
 */
function ColorField({
  label,
  help,
  value,
  check,
  onChange,
}: {
  label: string;
  help: string;
  value: string;
  check: ColorCheck;
  onChange: (value: string) => void;
}) {
  const t = useT("admin.appearance.branding");
  const pickerId = useId();
  const picker = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  const error = check.ok
    ? undefined
    : check.reason === "format"
      ? t("colorFormat")
      : t("contrastFail", { ratio: ratioText(check.ratio) });
  return (
    <div className="grid gap-2">
      <div className="flex items-end gap-3">
        <Input
          label={label}
          help={help}
          error={error}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          wrapperClassName="flex-1"
        />
        <input
          id={pickerId}
          type="color"
          aria-label={t("pickColor", { label })}
          value={picker}
          onChange={(e) => onChange(e.target.value)}
          className="mb-1 size-11 shrink-0 cursor-pointer rounded-md border-2 border-border-strong bg-surface-raised p-1"
        />
      </div>
      {check.ok && check.ratio > 0 ? (
        <p className="text-fs-2 text-success" data-testid="contrast-ok">
          {t("contrastOk", { ratio: ratioText(check.ratio) })}
        </p>
      ) : null}
      {!check.ok && check.reason === "contrast" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="size-6 rounded-sm border border-border-strong"
            style={{ background: check.suggestion }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange(check.suggestion)}
            data-testid="use-suggestion"
          >
            {t("useSuggestion", { color: check.suggestion })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

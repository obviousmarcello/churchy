"use client";

import { useState, type FormEvent } from "react";
import {
  RADIUS_STEPS,
  THEMES,
  contrastRatio,
  applyTheme,
  defaultThemeConfig,
  isHexColor,
  resolveThemeConfig,
  validateThemeConfig,
  type RadiusStep,
  type ThemeConfig,
} from "@churchy/themes";
import { Button, ButtonLink, Input, Select } from "@churchy/ui";

export interface ThemePlaygroundLabels {
  primaryLabel: string;
  primaryHelp: string;
  accentLabel: string;
  accentHelp: string;
  radiusLabel: string;
  radiusOptions: Record<RadiusStep, string>;
  apply: string;
  reset: string;
  invalidColor: string;
  contrastOk: string;
  contrastBad: string;
  previewButton: string;
  previewLink: string;
}

/**
 * Dev-only live editor: proves that a ThemeConfig change re-themes the page at runtime (no rebuild)
 * by calling `applyTheme()` on the showcase scope element.
 */
export function ThemePlayground({
  scopeId,
  initial,
  labels,
}: {
  scopeId: string;
  initial: ThemeConfig;
  labels: ThemePlaygroundLabels;
}) {
  const [primary, setPrimary] = useState(initial.colors.primary);
  const [accent, setAccent] = useState(initial.colors.accent);
  const [radius, setRadius] = useState<RadiusStep>(initial.radius);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [colorError, setColorError] = useState<{ primary?: string; accent?: string }>({});

  function apply(next: { primary: string; accent: string; radius: RadiusStep }) {
    const errors = {
      primary: isHexColor(next.primary) ? undefined : labels.invalidColor,
      accent: isHexColor(next.accent) ? undefined : labels.invalidColor,
    };
    setColorError(errors);
    if (errors.primary || errors.accent) return;
    const config = resolveThemeConfig({
      colors: { primary: next.primary, accent: next.accent },
      radius: next.radius,
    });
    const scope = document.getElementById(scopeId);
    if (scope) applyTheme(scope, config);
    const [issue] = validateThemeConfig(config);
    if (issue) {
      setMessage({
        ok: false,
        text: labels.contrastBad
          .replace("{ratio}", issue.ratio.toFixed(2).replace(".", ","))
          .replace("{suggestion}", issue.suggestion),
      });
    } else {
      setMessage({
        ok: true,
        text: labels.contrastOk.replace(
          "{ratio}",
          contrastRatio(config.colors.primary, THEMES[config.themeId].surface)
            .toFixed(2)
            .replace(".", ","),
        ),
      });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    apply({ primary, accent, radius });
  }

  function reset() {
    const d = defaultThemeConfig("klasszikus");
    setPrimary(d.colors.primary);
    setAccent(d.colors.accent);
    setRadius(d.radius);
    apply({ primary: d.colors.primary, accent: d.colors.accent, radius: d.radius });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5 md:grid-cols-3" noValidate>
      <Input
        label={labels.primaryLabel}
        help={labels.primaryHelp}
        error={colorError.primary}
        value={primary}
        onChange={(e) => setPrimary(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        data-testid="playground-primary"
      />
      <Input
        label={labels.accentLabel}
        help={labels.accentHelp}
        error={colorError.accent}
        value={accent}
        onChange={(e) => setAccent(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        data-testid="playground-accent"
      />
      <Select
        label={labels.radiusLabel}
        value={radius}
        onChange={(e) => setRadius(e.target.value as RadiusStep)}
        options={RADIUS_STEPS.map((step) => ({ value: step, label: labels.radiusOptions[step] }))}
      />
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button type="submit" data-testid="playground-apply">
          {labels.apply}
        </Button>
        <Button type="button" variant="secondary" onClick={reset}>
          {labels.reset}
        </Button>
        <Button type="button" variant="ghost">
          {labels.previewButton}
        </Button>
        <ButtonLink href="#tema" variant="secondary">
          {labels.previewLink}
        </ButtonLink>
        <p
          aria-live="polite"
          data-testid="playground-message"
          className={message?.ok === false ? "font-semibold text-danger" : "text-muted"}
        >
          {message?.text}
        </p>
      </div>
    </form>
  );
}

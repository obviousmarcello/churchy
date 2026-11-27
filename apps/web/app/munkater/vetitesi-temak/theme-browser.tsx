"use client";

import { useState, useTransition } from "react";
import { ChevronRightIcon, FilmIcon, PaletteIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import { FALLBACK_LOOK, type ProjectionThemeDTO } from "@/lib/music/projection/themes";
import { toastError } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import { projectionFontVariables } from "@/app/munkater/vetites/projection-fonts";
import { createThemeAction } from "./actions-client";
import { lookToFields, ThemeEditor } from "./theme-editor";

/**
 * The list of the themes on the left, the editor of the selected one on the
 * right. The default theme comes first and is selected at the start.
 */
export function ThemeBrowser({
  themes,
  canSetDefault,
}: {
  themes: ProjectionThemeDTO[];
  canSetDefault: boolean;
}) {
  const { m } = useI18n();
  const t = m.projectionThemes;
  const [selectedId, setSelectedId] = useState<string | null>(themes[0]?.id ?? null);
  const [creating, startCreate] = useTransition();
  // A deleted theme: the first one is selected.
  const selected = themes.find((theme) => theme.id === selectedId) ?? themes[0] ?? null;

  function create() {
    startCreate(async () => {
      // A new theme starts with the look of the default theme.
      const look = themes.find((theme) => theme.isDefault)?.look ?? FALLBACK_LOOK;
      const result = await createThemeAction({
        ...lookToFields(look),
        name: uniqueName(t.list.newThemeName, themes),
      });
      if (result.status === "success") setSelectedId(result.id);
      else toastError(result.message || t.list.createFailed);
    });
  }

  const newButton = (
    <Button type="button" variant="outline" onClick={create} disabled={creating}>
      <PlusIcon />
      {creating ? t.list.creating : t.list.newTheme}
    </Button>
  );

  if (!selected) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PaletteIcon />
          </EmptyMedia>
          <EmptyTitle>{t.list.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.list.emptyDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{newButton}</EmptyContent>
      </Empty>
    );
  }

  return (
    <div className={cn("flex flex-1 flex-col md:flex-row", projectionFontVariables)}>
      <nav
        aria-label={t.list.label}
        className="flex shrink-0 flex-col border-b md:w-72 md:border-r md:border-b-0"
      >
        <p className="px-4 pt-4 text-sm text-muted sm:px-6 md:px-4">{t.page.description}</p>
        <div className="px-4 py-3 sm:px-6 md:px-4">{newButton}</div>
        <ul className="divide-y border-t">
          {themes.map((theme) => {
            const isSelected = theme.id === selected.id;
            return (
              <li key={theme.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(theme.id)}
                  aria-current={isSelected ? "true" : undefined}
                  aria-controls="projection-theme-editor"
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6 md:px-4",
                    isSelected && "bg-surface-sunken",
                  )}
                >
                  <Swatch theme={theme} />
                  <span
                    className={cn("min-w-0 flex-1 truncate text-sm", isSelected && "font-medium")}
                  >
                    {theme.name}
                  </span>
                  {theme.isDefault && (
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                      {t.list.defaultBadge}
                    </span>
                  )}
                  <ChevronRightIcon className="size-4 shrink-0 text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        id="projection-theme-editor"
        className="@container flex min-w-0 flex-1 flex-col gap-4 px-4 py-6 sm:px-6"
      >
        {/* A new editor for each theme: a change that is not saved goes with it. */}
        <ThemeEditor
          key={selected.id}
          theme={selected}
          canSetDefault={canSetDefault}
          onCreated={setSelectedId}
        />
      </section>
    </div>
  );
}

/** A small slide in the colors of the theme: two lines of text, and a mark for a video background. */
function Swatch({ theme }: { theme: ProjectionThemeDTO }) {
  const { look } = theme;
  return (
    <span
      aria-hidden
      className="relative flex aspect-video w-12 shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded border"
      style={{ backgroundColor: look.background.color }}
    >
      {look.background.image && (
        // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
        <img
          src={look.background.image}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {look.background.image && look.background.dim > 0 && (
        <span
          className="absolute inset-0 bg-black"
          style={{ opacity: look.background.dim / 100 }}
        />
      )}
      <span
        className="relative h-0.5 w-6 rounded-full"
        style={{ backgroundColor: look.textColor }}
      />
      <span
        className="relative h-0.5 w-4 rounded-full"
        style={{ backgroundColor: look.textColor }}
      />
      {look.background.video && (
        <FilmIcon className="absolute right-0.5 bottom-0.5 size-2.5 rounded-sm bg-black/70 p-px text-white" />
      )}
    </span>
  );
}

/** The name, or the name with a number when a theme has it already, e.g. "New theme 2". */
function uniqueName(name: string, themes: ProjectionThemeDTO[]): string {
  const names = new Set(themes.map((theme) => theme.name));
  if (!names.has(name)) return name;
  let number = 2;
  while (names.has(`${name} ${number}`)) number++;
  return `${name} ${number}`;
}

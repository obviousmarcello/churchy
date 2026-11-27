"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { useI18n } from "@/i18n/music/client";
import { NativeSelect } from "@/components/music/ui/native-select";
import { setEventThemeAction, setItemThemeAction } from "@/app/munkater/vetites/actions-client";
import type { ProjectionThemeDTO } from "@/lib/music/projection/themes";

/**
 * The projection theme of the event (`itemKey` null) or of one of its items: "none" means the theme
 * of the event, or of the default theme for the event. The users who can project the event and the
 * event admins change it (the model checks). Renders only with the module "projection.themes".
 */
export function ThemeSelect({
  eventId,
  itemKey = null,
  themes,
  value,
  inheritedName,
  label,
  hideLabel = false,
}: {
  eventId: string;
  itemKey?: string | null;
  themes: ProjectionThemeDTO[];
  /** The chosen theme; null: the inherited one. */
  value: string | null;
  /** The name of the theme that "none" gives (the event's or the default). */
  inheritedName: string;
  label: string;
  /** The label is only for screen readers (the select of an item in a list). */
  hideLabel?: boolean;
}) {
  const { m, format } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function change(next: string) {
    const themeId = next === "" ? null : next;
    setChosen(themeId);
    setError(null);
    start(async () => {
      const result =
        itemKey === null
          ? await setEventThemeAction(eventId, themeId)
          : await setItemThemeAction(eventId, itemKey, themeId);
      if (result.status === "error") {
        setChosen(value);
        setError(result.message || m.events.theme.saveFailed);
      } else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {!hideLabel && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <NativeSelect
        id={id}
        aria-label={hideLabel ? label : undefined}
        value={chosen ?? ""}
        disabled={pending}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">{format(m.events.theme.defaultOption, { name: inheritedName })}</option>
        {themes.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </NativeSelect>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

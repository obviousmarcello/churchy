"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { LoaderCircleIcon, PaletteIcon } from "lucide-react";

import { invalidatePageCache } from "@/components/music/page-cache";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { changedPages } from "@/lib/music/page-keys";
import type { ProjectionThemeDTO } from "@/lib/music/projection/themes";
import { setEventThemeAction } from "@/app/munkater/vetites/actions-client";

type Status = { kind: "idle" | "saving" } | { kind: "error"; message: string };

/**
 * The projection theme of the event, for the event admins. Null: the default
 * theme. Each item can have its own theme (see `SetlistRows`). Saves at once.
 */
export function EventThemeSelect({
  eventId,
  themes,
  value,
}: {
  eventId: string;
  /** The default first. */
  themes: Pick<ProjectionThemeDTO, "id" | "name" | "isDefault">[];
  value: string | null;
}) {
  const { m, format } = useI18n();
  const t = m.events.theme;
  const id = useId();
  // A deleted theme shows as the default, and so does the default theme itself.
  const shownValue = themes.some((theme) => theme.id === value && !theme.isDefault) ? value : null;
  const [selected, setSelected] = useState(shownValue);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // A change of another user, e.g. at the projection: the select follows it, but not during a save here.
  const [known, setKnown] = useState(shownValue);
  if (shownValue !== known) {
    setKnown(shownValue);
    if (status.kind !== "saving") setSelected(shownValue);
  }
  const [, startSave] = useTransition();
  const defaultTheme = themes.find((theme) => theme.isDefault);

  function change(themeId: string | null) {
    setSelected(themeId);
    setStatus({ kind: "saving" });
    startSave(async () => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await setEventThemeAction(eventId, themeId);
        setStatus(
          result.status === "success"
            ? { kind: "idle" }
            : { kind: "error", message: result.message },
        );
      } catch {
        setStatus({ kind: "error", message: t.saveFailed });
      }
    });
  }

  return (
    // One line when the pane has room: the label, the select, the link.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <label htmlFor={`${id}-theme`} className="flex items-center gap-2 text-muted">
        <PaletteIcon aria-hidden className="size-4" />
        {t.label}
      </label>
      <NativeSelect
        id={`${id}-theme`}
        value={selected ?? ""}
        onChange={(event) => change(event.target.value || null)}
        aria-describedby={status.kind === "error" ? `${id}-error` : undefined}
        className="w-auto max-w-full min-w-48"
      >
        <option value="">{format(t.defaultOption, { name: defaultTheme?.name ?? "" })}</option>
        {themes
          .filter((theme) => !theme.isDefault)
          .map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
      </NativeSelect>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href="/munkater/vetitesi-temak"
          className="text-muted underline-offset-4 hover:underline"
        >
          {t.manage}
        </Link>
        {/* The select shows the saved theme: only the save and its error show. */}
        <span role="status" className="flex items-center gap-1 text-muted empty:hidden">
          {status.kind === "saving" && (
            <>
              <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
              {t.saving}
            </>
          )}
        </span>
      </div>
      {status.kind === "error" && (
        <p id={`${id}-error`} role="alert" className="basis-full text-danger">
          {status.message}
        </p>
      )}
    </div>
  );
}

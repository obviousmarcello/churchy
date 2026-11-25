"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { useI18n } from "@/i18n/music/client";
import { removeCalendarAction, saveCalendarAction } from "../media-actions";

type Outcome =
  | { readonly ok: true; readonly value: { ok: boolean; message?: string | null } }
  | { readonly ok: false; readonly status: 403 | 404 };

export function SourcesPanel({
  calendars,
}: {
  calendars: { id: string; name: string; urlHint: string }[];
}) {
  const { m } = useI18n();
  const t = m.events.media;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const send = (action: (data: FormData) => Promise<Outcome>, data: FormData) =>
    start(async () => {
      const result = await action(data);
      setError(
        !result.ok || !result.value.ok
          ? (result.ok ? result.value.message : null) || t.failed
          : null,
      );
      router.refresh();
    });
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{t.sourcesLead}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {calendars.map((calendar) => (
          <li
            key={calendar.id}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <span>
              {calendar.name} <span className="text-sm text-muted">{calendar.urlHint}</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                const data = new FormData();
                data.set("id", calendar.id);
                send(removeCalendarAction, data);
              }}
            >
              {t.sourceDelete}
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(saveCalendarAction, new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <Label htmlFor="source-name">{t.sourceName}</Label>
        <Input id="source-name" name="name" required maxLength={100} />
        <Label htmlFor="source-url">{t.sourceUrl}</Label>
        <Input id="source-url" name="url" type="url" required maxLength={2000} />
        <Button type="submit" variant="outline" disabled={pending} className="self-start">
          {t.sourceAdd}
        </Button>
      </form>
    </div>
  );
}

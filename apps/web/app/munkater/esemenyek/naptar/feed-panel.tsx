"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { useI18n } from "@/i18n/music/client";
import {
  disableCalendarFeedAction,
  enableCalendarFeedAction,
  renewCalendarFeedAction,
} from "./actions";

type Outcome =
  | { readonly ok: true; readonly value: { link: string | null; on: boolean } }
  | { readonly ok: false; readonly status: 403 | 404 };

export function FeedPanel({ initiallyOn }: { initiallyOn: boolean }) {
  const { m } = useI18n();
  const t = m.events.calendar;
  const [on, setOn] = useState(initiallyOn);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (action: () => Promise<Outcome>) =>
    start(async () => {
      const result = await action();
      if (!result.ok) return;
      setOn(result.value.on);
      setLink(result.value.link);
    });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{t.lead}</p>
      <p role="status">{on ? t.on : t.off}</p>
      {link && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="feed-link">{t.linkLabel}</Label>
          <Input id="feed-link" readOnly value={link} onFocus={(event) => event.target.select()} />
        </div>
      )}
      {!on ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => enableCalendarFeedAction(data));
          }}
        >
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" required className="mt-1" />
            {t.consent}
          </label>
          <Button type="submit" disabled={pending} className="self-start">
            {t.enable}
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => renewCalendarFeedAction())}
          >
            {t.renew}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => disableCalendarFeedAction())}
          >
            {t.disable}
          </Button>
        </div>
      )}
    </div>
  );
}

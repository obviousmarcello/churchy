"use client";

import { useId, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLinkIcon, XIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_FORM_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { Label } from "@/components/music/ui/label";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import { bookLimit, CACHE_MAX_VERSES } from "@/lib/music/scripture/cache-limits";
import { parsePastedVerses, type PastedVerse } from "@/lib/music/scripture/paste";
import { parseScriptureReference, referenceStyle } from "@/lib/music/scripture/reference";
import { sourceLinks } from "@/lib/music/scripture/source-links";
import type { ScriptureTranslation } from "@/lib/music/scripture/translations";
import { cacheVersesAction } from "./actions-client";

// The text of a scripture reading in a "pasted" translation (see
// `translations.ts`): the user pastes the verses from a Bible app or a
// website, and they go to the shared cache for 24 hours. The preview shows
// the verses that the verse numbers split (see `paste.ts`).

export function PasteScriptureDialog({
  reference,
  translation,
  open,
  onOpenChange,
  onSaved,
  eventId = null,
}: {
  /** The reference of the reading, e.g. "Jn 3,16–21". */
  reference: string;
  translation: ScriptureTranslation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a save, with the saved verses of the book. */
  onSaved: (book: string, verses: PastedVerse[]) => void;
  /** The event of the projection: its volunteers may save verses too. */
  eventId?: string | null;
}) {
  const { m, format } = useI18n();
  const t = m.project.paste;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-2xl")}>
          <DialogHeader className="flex-row items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                {format(t.title, { reference, translation: translation.shortName })}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {format(t.description, { max: CACHE_MAX_VERSES })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.common.actions.close}
                />
              }
            >
              <XIcon />
            </Dialog.Close>
          </DialogHeader>
          {/* A new editor for each opening: it starts empty. */}
          {open && (
            <PasteEditor
              reference={reference}
              translation={translation}
              eventId={eventId}
              onDone={(book, verses) => {
                onSaved(book, verses);
                onOpenChange(false);
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PasteEditor({
  reference,
  translation,
  eventId,
  onDone,
}: {
  reference: string;
  translation: ScriptureTranslation;
  eventId: string | null;
  onDone: (book: string, verses: PastedVerse[]) => void;
}) {
  const { m, format } = useI18n();
  const t = m.project.paste;
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const parsed = parseScriptureReference(reference);
  const english = referenceStyle(reference)?.english ?? false;
  const result = parsed ? parsePastedVerses(text, parsed, bookLimit(parsed.book)) : null;
  const links = parsed && translation.sources ? sourceLinks(parsed, translation.sources) : [];
  const verses = result?.status === "ok" ? result.verses : [];
  const problem =
    result?.status === "missing"
      ? format(t.missing, { place: `${result.chapter}${english ? ":" : ","}${result.verse}` })
      : result?.status === "tooMany"
        ? format(t.tooMany, { count: result.count, max: result.max })
        : null;

  function save() {
    if (!parsed || verses.length === 0) return;
    setError(null);
    startSave(async () => {
      try {
        const saved = await cacheVersesAction(translation.id, parsed.book, verses, eventId);
        if (saved.status === "error") setError(saved.message);
        else onDone(parsed.book, verses);
      } catch {
        // The request failed, e.g. without a connection.
        setError(t.saveFailed);
      }
    });
  }

  return (
    <form
      className={DIALOG_FORM_CLASS}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <DialogBody>
        {links.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {links.map(({ site, url }) => (
                // A new tab; the installed app and the desktop app open it in the browser.
                <a
                  key={site}
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
                >
                  <ExternalLinkIcon aria-hidden className="size-4" />
                  {format(t.openSource, { site })}
                </a>
              ))}
            </div>
            <p className="text-xs text-muted">{format(t.sourceHint, { reference })}</p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-text`}>{t.label}</Label>
          <Textarea
            id={`${id}-text`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t.placeholder}
            aria-invalid={problem !== null}
            aria-describedby={problem ? `${id}-problem` : undefined}
            className="max-h-60 min-h-28"
            autoFocus
          />
          {problem && (
            <p id={`${id}-problem`} className="text-sm text-danger">
              {problem}
            </p>
          )}
        </div>
        <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-2">
          <h3 id={`${id}-preview`} className="text-sm font-medium">
            {t.preview}
          </h3>
          {verses.length === 0 ? (
            <p className="rounded-card border border-dashed p-4 text-center text-sm text-muted">
              {t.previewEmpty}
            </p>
          ) : (
            <ol className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-card border p-3 text-sm">
              {verses.map((verse) => (
                <li key={`${verse.chapter}:${verse.verse}`}>
                  <span className="mr-1.5 font-semibold text-muted tabular-nums">
                    {verse.chapter}
                    {english ? ":" : ","}
                    {verse.verse}
                  </span>
                  {verse.text}
                </li>
              ))}
            </ol>
          )}
          {translation.notice && <p className="text-xs text-muted">{translation.notice}</p>}
        </section>
      </DialogBody>
      <DialogFooter>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <DialogActions>
          <Dialog.Close render={<Button type="button" variant="ghost" disabled={saving} />}>
            {m.common.actions.cancel}
          </Dialog.Close>
          <Button type="submit" disabled={saving || verses.length === 0}>
            {saving ? m.common.actions.saving : t.save}
          </Button>
        </DialogActions>
      </DialogFooter>
    </form>
  );
}

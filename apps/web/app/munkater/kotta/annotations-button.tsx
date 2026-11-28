"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Popover } from "@base-ui/react/popover";
import { StickyNoteIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { Textarea } from "@/components/music/ui/textarea";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import {
  createAnnotationAction,
  deleteAnnotationAction,
  updateAnnotationAction,
} from "./annotation-actions-client";
import type { SheetAnnotation, SheetSong } from "./sheet-viewer";

/**
 * The user's own notes on the song of the sheet: of the whole song or of a section, for every
 * arrangement or for the setlist slot of an event only. The notes show here with their section
 * and can be added, changed and deleted; the page loads again after each change.
 */
export function AnnotationsButton({ song }: { song: SheetSong }) {
  const { m, format } = useI18n();
  const t = m.sheet.annotations;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [section, setSection] = useState("");
  const [slotOnly, setSlotOnly] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (song.songId === null) return null;
  const songId = song.songId;

  function run(
    work: () => Promise<{ status: string; message: string | null }>,
    after?: () => void,
  ) {
    setError(null);
    start(async () => {
      const result = await work();
      if (result.status === "error") setError(result.message || t.saveFailed);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="relative h-8 min-w-8 px-2 pointer-coarse:h-9 pointer-coarse:min-w-9"
            aria-label={format(t.buttonLabel, { count: song.annotations.length })}
            title={t.title}
          />
        }
      >
        <StickyNoteIcon />
        {song.annotations.length > 0 && (
          <span className="text-xs tabular-nums">{song.annotations.length}</span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={8} className="z-50">
          <Popover.Popup className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto rounded-card border bg-surface-raised p-4 text-text shadow-lg outline-none">
            <Popover.Title className="text-sm font-semibold">{t.title}</Popover.Title>
            {song.annotations.length === 0 ? (
              <p className="text-sm text-muted">{t.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {song.annotations.map((note: SheetAnnotation) => (
                  <li
                    key={note.id}
                    className="flex flex-col gap-1 rounded-control border p-2 text-sm"
                  >
                    <span className="text-xs text-muted">
                      {note.sectionLabel ?? t.wholeSong}
                      {note.setlistItemId !== null && ` · ${t.thisSlotOnly}`}
                    </span>
                    {editing?.id === note.id ? (
                      <>
                        <Textarea
                          aria-label={t.bodyLabel}
                          value={editing.body}
                          maxLength={1000}
                          onChange={(event) =>
                            setEditing({ id: note.id, body: event.target.value })
                          }
                        />
                        <span className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={pending || editing.body.trim() === ""}
                            onClick={() =>
                              run(
                                () => updateAnnotationAction(note.id, { body: editing.body }),
                                () => setEditing(null),
                              )
                            }
                          >
                            {t.save}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            {t.cancel}
                          </Button>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="break-words whitespace-pre-wrap">{note.body}</span>
                        <span className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing({ id: note.id, body: note.body })}
                          >
                            {t.edit}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            disabled={pending}
                            aria-label={t.delete}
                            onClick={() => run(() => deleteAnnotationAction(note.id))}
                          >
                            <Trash2Icon />
                          </Button>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex flex-col gap-2 border-t pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                run(
                  () =>
                    createAnnotationAction({
                      songId,
                      setlistItemId: slotOnly ? song.slotItemId : null,
                      sectionLabel: section,
                      body,
                    }),
                  () => {
                    setBody("");
                    setSection("");
                  },
                );
              }}
            >
              <Textarea
                aria-label={t.bodyLabel}
                placeholder={t.bodyPlaceholder}
                value={body}
                maxLength={1000}
                onChange={(event) => setBody(event.target.value)}
              />
              <Input
                aria-label={t.sectionLabel}
                placeholder={t.sectionPlaceholder}
                value={section}
                maxLength={100}
                onChange={(event) => setSection(event.target.value)}
              />
              {song.slotItemId !== null && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={slotOnly}
                    onChange={(event) => setSlotOnly(event.target.checked)}
                  />
                  {t.thisSlotOnly}
                </label>
              )}
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" size="sm" disabled={pending || body.trim() === ""}>
                {t.add}
              </Button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

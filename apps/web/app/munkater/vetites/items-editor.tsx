"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { EditSongDialog, type EditSongTarget } from "@/app/munkater/enektar/edit-song-dialog";
import { FileDropArea } from "@/components/music/file-drop";
import { LoadingRegion } from "@/components/music/loading-skeletons";
import { Button } from "@/components/music/ui/button";
import { Skeleton } from "@/components/music/ui/skeleton";
import { useI18n } from "@/i18n/music/client";
import { resolveLook } from "@/lib/music/projection/themes";
import { ItemsForm, toItemRows } from "@/app/munkater/esemenyek/editor/items-form";
import {
  eventItemsEditorAction,
  type ItemsEditorPart,
  type ItemsEditorPartsDTO,
} from "./actions-client";

/** All the parts of the data of the editor: its first load. */
export const ALL_EDITOR_PARTS: readonly ItemsEditorPart[] = [
  "event",
  "volunteers",
  "catalog",
  "themes",
  "images",
  "announcements",
];

/** A request to load parts of the data of the editor again: a new `token` for each request. */
export type EditorReload = { token: number; parts: readonly ItemsEditorPart[] };

/** The data of the editor with all its parts. */
type EditorData = Required<ItemsEditorPartsDTO>;

/**
 * The items editor of the event page in the setlist of the controller, for
 * the event admins: the edit mode (see `ProjectionController`). Each change
 * saves automatically, as on the event page (see `ItemsForm`); the controller
 * gets the new items over Realtime, as after a change on another device.
 * A new `reload` loads its parts again, e.g. after a change of another user:
 * the editor merges the items with its changes that are not saved yet. The
 * parts of a load that fails or stops wait for the next load.
 * Files dropped on the controller in the edit mode become image items.
 */
export function ItemsEditorPanel({
  eventId,
  liveKey,
  reload,
  onSongSaved,
}: {
  eventId: string;
  /** The key of the item on the screens now, if it is an item of the event. */
  liveKey: string | null;
  reload: EditorReload;
  /** After a save in the song edit dialog: the slides of the songs can be new. */
  onSongSaved: () => void;
}) {
  const { m } = useI18n();
  const t = m.project.controller;
  const [data, setData] = useState<EditorData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editingSong, setEditingSong] = useState<EditSongTarget | null>(null);
  /** The parts to load: all of them at first. */
  const waiting = useRef(new Set<ItemsEditorPart>(ALL_EDITOR_PARTS));

  useEffect(() => {
    for (const part of reload.parts) waiting.current.add(part);
    const parts = [...waiting.current];
    if (parts.length === 0) return;
    let current = true;
    void eventItemsEditorAction(eventId, parts).then(
      (next) => {
        if (!current) return;
        // A failed load again keeps the items that the editor has.
        if (!next) {
          setFailed(true);
          return;
        }
        for (const part of parts) waiting.current.delete(part);
        setData((before) => withParts(before, next));
        setFailed(false);
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [eventId, reload, attempt]);

  const allThemes = data?.themes;
  const eventThemeId = data?.event.projectionThemeId;
  const themes = useMemo(
    () => allThemes?.map(({ id, name, isDefault }) => ({ id, name, isDefault })) ?? [],
    [allThemes],
  );
  const look = useMemo(
    () => (allThemes ? resolveLook(allThemes, null, eventThemeId) : null),
    [allThemes, eventThemeId],
  );

  if (!data || !look) {
    return failed ? (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-x-2 px-3 pb-3 text-sm text-danger"
      >
        {t.editorLoadFailed}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t.editorRetry}
        </Button>
      </div>
    ) : (
      <LoadingRegion label={t.editorLoading} className="flex flex-col gap-2 px-3 pb-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </LoadingRegion>
    );
  }

  return (
    <FileDropArea>
      <div className="px-3 pb-3">
        <ItemsForm
          key={`items-${eventId}`}
          eventId={eventId}
          setlistId={data.event.setlistId}
          selection={toItemRows(data.event.items)}
          liveKey={liveKey}
          blocks={data.event.blocks}
          catalog={data.catalog}
          volunteers={data.volunteers}
          themes={themes}
          maxItems={data.maxItems}
          imageSets={data.imageSets}
          look={look}
          announcements={data.announcements}
          eventStartsAt={data.event.startsAt}
          eventEndsAt={data.event.endsAt}
          eventDurationMinutes={data.event.durationMinutes}
          onEditSong={data.canEditSongs ? setEditingSong : undefined}
        />
      </div>
      {data.canEditSongs && (
        <EditSongDialog
          target={editingSong}
          onClose={() => setEditingSong(null)}
          onSaved={onSongSaved}
        />
      )}
    </FileDropArea>
  );
}

/** The data with the new parts. Null until the data has all its parts: the first load asks for all of them. */
function withParts(before: EditorData | null, next: ItemsEditorPartsDTO): EditorData | null {
  const event = next.event ?? before?.event;
  const volunteers = next.volunteers ?? before?.volunteers;
  const catalog = next.catalog ?? before?.catalog;
  const themes = next.themes ?? before?.themes;
  const imageSets = next.imageSets ?? before?.imageSets;
  const announcements = next.announcements ?? before?.announcements;
  if (!event || !volunteers || !catalog || !themes || !imageSets || !announcements) return before;
  return {
    event,
    volunteers,
    catalog,
    themes,
    imageSets,
    announcements,
    canEditSongs: next.canEditSongs,
    maxItems: next.maxItems,
  };
}

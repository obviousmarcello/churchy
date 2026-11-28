"use client";

import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import {
  FileMusicIcon,
  ListMusicIcon,
  PresentationIcon,
  RotateCcwIcon,
  SaveIcon,
  Undo2Icon,
} from "lucide-react";

import { EventFields } from "@/app/munkater/esemenyek/editor/event-fields";
import { EditSongButton, EditSongDialog } from "@/app/munkater/enektar/edit-song-dialog";
import { AddItemBox } from "@/components/music/add-item-box";
import { ModuleGate } from "@/components/music/app-config";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_FORM_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Field, FieldMessage } from "@/components/music/form-field";
import { ListDetail } from "@/components/music/list-detail";
import { RowsSkeleton } from "@/components/music/loading-skeletons";
import { PrintSetlistButton, type PrintSetlistItem } from "@/components/music/print-setlist";
import {
  SetlistRows,
  isTextRow,
  scriptureTranslationInput,
  type ItemRow,
  type SetlistRow,
} from "@/components/music/setlist-rows";
import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { NativeSelect } from "@/components/music/ui/native-select";
import { NAV_FORWARD } from "@/components/music/page-transition";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import type { EventScopeOptions } from "@/lib/music/event-scopes";
import { formatEventItems } from "@/lib/music/format";
import { projectionHref, sheetHref } from "@/lib/music/next-path";
import { cn } from "@/lib/music/utils";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";
import { saveSetlistAction, type SaveSetlistState } from "./actions-client";
import { parseDraft, readDraftSnapshot, subscribeToDraft, writeDraft } from "./draft";
import { RehearsalHeader } from "./rehearsal-header";
import { SONG_DRAG_TYPE, SongCatalog } from "./song-catalog";

export type EventOption = {
  id: string;
  title: string;
  /** ISO 8601 timestamp. */
  startsAt: string;
  /** Songs and text items. */
  itemCount: number;
  isPast: boolean;
};

/** For event admins: what they need to save the setlist to an event. */
export type SaveOptions = {
  /** Upcoming events soonest first, then past events latest first. */
  events: EventOption[];
  defaultDurationMinutes: number;
  /** The groups of the "Groups" field of a new event. */
  scope: EventScopeOptions;
};

const initialState: SaveSetlistState = {
  status: "idle",
  message: null,
  fieldErrors: {},
  eventId: null,
};

/**
 * A setlist that is not part of an event yet, for rehearsals and small
 * events: songs and text items, edited as the items of an event. It is a
 * draft in this browser (see `draft.ts`) until an event admin saves it to an
 * event.
 */
export function RehearsalBuilder({
  catalog,
  maxItems,
  canEditSongs,
  canPasteScripture,
  save,
}: {
  /** Every song with its arrangements, by title. */
  catalog: SongWithArrangementsDTO[];
  maxItems: number;
  /** Song admins and superadmins can add songs to the catalog and edit them. */
  canEditSongs: boolean;
  /** Only music leaders and event admins can paste the text of a reading into the shared cache. */
  canPasteScripture: boolean;
  /** Null for users who cannot save to an event. */
  save: SaveOptions | null;
}) {
  // The server does not know the draft, so it renders the loading text.
  const snapshot = useSyncExternalStore(subscribeToDraft, readDraftSnapshot, () => null);
  const songsById = useMemo(() => new Map(catalog.map((song) => [song.id, song])), [catalog]);
  const rows = useMemo(
    () => (snapshot === null ? null : knownRows(parseDraft(snapshot), songsById)),
    [snapshot, songsById],
  );
  // The rows before "Start fresh", for undo.
  const [cleared, setCleared] = useState<ItemRow[] | null>(null);
  // The row whose song shows in the edit dialog.
  const [editing, setEditing] = useState<SetlistRow | null>(null);
  // A song of the catalog is dragging, and where it goes in the setlist.
  const [draggingSong, setDraggingSong] = useState(false);
  const [drop, setDrop] = useState<{ index: number; top: number } | null>(null);
  const setlistRef = useRef<HTMLElement>(null);
  const i18n = useI18n();
  const { m, plural } = i18n;

  if (rows === null) {
    return (
      <main className="flex flex-1 flex-col">
        <RehearsalHeader />
        <RowsSkeleton label={m.rehearsal.page.loadingSetlist} rows={5} />
      </main>
    );
  }

  // Only the songs go on the sheet.
  const songRows = rows.filter((row) => !isTextRow(row));
  // The server rejects a text item without a title.
  const canSave = rows.every((row) => !isTextRow(row) || row.title.trim() !== "");

  function change(next: ItemRow[]) {
    setCleared(null);
    writeDraft(next);
  }

  function add(row: ItemRow) {
    change([...(rows ?? []), row]);
  }

  /** A song of the catalog, with its default arrangement (the first), at `index` or at the end. */
  function addSong(song: SongWithArrangementsDTO, index = rows?.length ?? 0) {
    if (!rows || rows.length >= maxItems) return;
    const row: ItemRow = {
      kind: "song",
      key: crypto.randomUUID(),
      songId: song.id,
      arrangementId: song.arrangements[0]!.id,
      volunteerId: null,
    };
    change([...rows.slice(0, index), row, ...rows.slice(index)]);
  }

  /** The place of a dragged song: before the first row whose middle is below the pointer, and the top of the line that shows it. */
  function dropAt(clientY: number): { index: number; top: number } {
    const section = setlistRef.current;
    const items = Array.from(section?.querySelectorAll("[data-row]") ?? []);
    const base = section?.getBoundingClientRect().top ?? 0;
    const index = items.filter((item) => {
      const box = item.getBoundingClientRect();
      return clientY > box.top + box.height / 2;
    }).length;
    const before = items[index]?.getBoundingClientRect();
    const last = items[items.length - 1]?.getBoundingClientRect();
    // The line goes in the gap between the rows.
    const top = before ? before.top - base - 5 : last ? last.bottom - base + 3 : 0;
    return { index, top };
  }

  function startFresh() {
    setCleared(rows);
    writeDraft([]);
  }

  function undo() {
    if (cleared) writeDraft(cleared);
    setCleared(null);
  }

  const full = rows.length >= maxItems;

  // The songs of the catalog are the supporting list on large screens: they drag into the setlist.
  return (
    <ListDetail
      title={m.rehearsal.page.title}
      rootHref="/munkater/proba"
      open
      supporting
      size="wide"
      header={false}
      nav={
        <SongCatalog
          catalog={catalog}
          inSetlist={new Set(songRows.map((row) => row.songId))}
          full={full}
          onAdd={(song) => addSong(song)}
          onDragChange={(dragging) => {
            setDraggingSong(dragging);
            if (!dragging) setDrop(null);
          }}
        />
      }
    >
      {/* The main action at the top, as "Edit details" of an event. */}
      <RehearsalHeader
        actions={
          save && (
            <SaveDialog
              rows={rows}
              canSave={canSave}
              options={save}
              onSaved={() => writeDraft([])}
            />
          )
        }
      />
      <div className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6">
        {/* The actions of the setlist as round buttons, as on the event page. */}
        <div className="flex flex-wrap items-center gap-2">
          <ModuleGate id="sheet">
            {songRows.length > 0 ? (
              <Link
                href={sheetHref(
                  songRows.map((row) => row.arrangementId),
                  "/rehearsal",
                  songRows.map((row) => row.musicalKey),
                )}
                transitionTypes={NAV_FORWARD}
                className={buttonVariants({ variant: "secondary", className: "rounded-full" })}
              >
                <FileMusicIcon />
                {m.rehearsal.page.openSheet}
              </Link>
            ) : (
              <Button type="button" variant="secondary" className="rounded-full" disabled>
                <FileMusicIcon />
                {m.rehearsal.page.openSheet}
              </Button>
            )}
          </ModuleGate>
          <ModuleGate id="projection">
            {rows.length > 0 ? (
              <Link
                href={projectionHref(null)}
                transitionTypes={NAV_FORWARD}
                className={buttonVariants({ variant: "secondary", className: "rounded-full" })}
              >
                <PresentationIcon />
                {m.rehearsal.page.project}
              </Link>
            ) : (
              <Button type="button" variant="secondary" className="rounded-full" disabled>
                <PresentationIcon />
                {m.rehearsal.page.project}
              </Button>
            )}
          </ModuleGate>
          <PrintSetlistButton
            title={m.rehearsal.page.title}
            summary={rows.length > 0 ? summarize(i18n, rows, songsById) : undefined}
            items={printItems(i18n, rows, songsById)}
            labelClassName=""
            variant="secondary"
            className="rounded-full"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={rows.length === 0}
            onClick={startFresh}
          >
            <RotateCcwIcon />
            {m.rehearsal.page.startFresh}
          </Button>
        </div>

        <section
          ref={setlistRef}
          aria-labelledby="rehearsal-setlist"
          className="relative flex flex-col gap-4 border-t pt-6"
          // A song of the catalog drops at the place of the pointer.
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(SONG_DRAG_TYPE) || full) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            const next = dropAt(event.clientY);
            if (next.index !== drop?.index || next.top !== drop?.top) setDrop(next);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDrop(null);
          }}
          onDrop={(event) => {
            const song = songsById.get(event.dataTransfer.getData(SONG_DRAG_TYPE));
            if (!song) return;
            event.preventDefault();
            addSong(song, drop?.index ?? rows.length);
            setDrop(null);
            setDraggingSong(false);
          }}
        >
          {drop && rows.length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary"
              style={{ top: drop.top }}
            />
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2
              id="rehearsal-setlist"
              className="font-heading text-base font-semibold tracking-tight"
            >
              {m.rehearsal.setlist.title}
            </h2>
            {rows.length > 0 && (
              <p className="text-xs text-muted">{summarize(i18n, rows, songsById)}</p>
            )}
          </div>

          {rows.length > 0 ? (
            <SetlistRows
              rows={rows}
              songsById={songsById}
              onChange={change}
              canPasteScripture={canPasteScripture}
              // This only shows the buttons. Saving checks the song admin role again.
              rowActions={
                canEditSongs
                  ? (row, title) => <EditSongButton title={title} onClick={() => setEditing(row)} />
                  : undefined
              }
            />
          ) : (
            <Empty
              className={cn(
                "rounded-card border p-6 transition-colors md:p-8",
                draggingSong && "border-primary/50 bg-primary/5",
                drop && "border-primary bg-primary/10",
              )}
            >
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListMusicIcon />
                </EmptyMedia>
                <EmptyTitle>{m.rehearsal.setlist.emptyTitle}</EmptyTitle>
                <EmptyDescription>
                  {save ? m.rehearsal.setlist.emptyCanSave : m.rehearsal.setlist.emptyCannotSave}
                </EmptyDescription>
              </EmptyHeader>
              {cleared && (
                <EmptyContent>
                  <Button type="button" variant="outline" onClick={undo}>
                    <Undo2Icon />
                    {m.rehearsal.setlist.undoStartFresh}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}

          {full ? (
            <p className="text-sm text-muted">{plural(m.rehearsal.setlist.full, maxItems)}</p>
          ) : (
            <AddItemBox catalog={catalog} rows={rows} onAdd={add} canAddSongs={canEditSongs} />
          )}
          {songRows.length > 0 && songRows.length < rows.length && (
            <ModuleGate id="sheet">
              <p className="text-sm text-muted">{m.rehearsal.setlist.sheetSongsOnly}</p>
            </ModuleGate>
          )}
          {save && !canSave && (
            <p className="text-sm text-muted">{m.rehearsal.setlist.needTitles}</p>
          )}
        </section>
      </div>

      {canEditSongs && <EditSongDialog target={editing} onClose={() => setEditing(null)} />}
    </ListDetail>
  );
}

/** The "Save to event" button in the header, and its dialog. */
function SaveDialog({
  rows,
  canSave,
  options,
  onSaved,
}: {
  rows: ItemRow[];
  /** False while a text item has no title. */
  canSave: boolean;
  options: SaveOptions;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(initialState);
  const { events, defaultDurationMinutes, scope } = options;
  const [target, setTarget] = useState<"existing" | "new">(
    events.some((event) => !event.isPast) ? "existing" : "new",
  );
  const [eventId, setEventId] = useState("");
  const { m, plural } = useI18n();

  const selected = events.find((event) => event.id === eventId);
  const upcoming = events.filter((event) => !event.isPast);
  const past = events.filter((event) => event.isPast);
  const eventInvalid = (state.fieldErrors.eventId?.length ?? 0) > 0;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveSetlistAction(formData);
      setState(result);
      if (result.status === "success" && result.eventId) {
        const href = `/munkater/esemenyek/${result.eventId}`;
        onSaved();
        startTransition(() => router.push(href));
      }
    });
  }

  function changeOpen(next: boolean) {
    if (pending) return;
    // Each time it opens, the dialog starts without the errors of the last save.
    if (next) setState(initialState);
    setOpen(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger
        render={
          <Button type="button" className="rounded-full" disabled={rows.length === 0 || !canSave} />
        }
      >
        <SaveIcon />
        <HeaderLabel>{m.rehearsal.saveDialog.trigger}</HeaderLabel>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader>
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {m.rehearsal.saveDialog.title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              {plural(m.rehearsal.saveDialog.description, rows.length)}
            </Dialog.Description>
          </DialogHeader>

          <form onSubmit={submit} className={DIALOG_FORM_CLASS}>
            <input type="hidden" name="items" value={JSON.stringify(rows.map(toInput))} />

            <DialogBody>
              {events.length > 0 ? (
                <fieldset>
                  <legend className="sr-only">{m.rehearsal.saveDialog.targetLegend}</legend>
                  <div className="grid grid-cols-2 gap-1 rounded-card bg-surface-sunken p-1">
                    <TargetOption
                      value="existing"
                      checked={target === "existing"}
                      onSelect={setTarget}
                    >
                      {m.rehearsal.saveDialog.existingEvent}
                    </TargetOption>
                    <TargetOption value="new" checked={target === "new"} onSelect={setTarget}>
                      {m.rehearsal.saveDialog.newEvent}
                    </TargetOption>
                  </div>
                </fieldset>
              ) : (
                <p className="text-sm text-muted">{m.rehearsal.saveDialog.noEvents}</p>
              )}

              {target === "existing" && events.length > 0 ? (
                <Field
                  name="eventId"
                  label={m.rehearsal.saveDialog.eventLabel}
                  hint={
                    selected
                      ? selected.itemCount > 0
                        ? plural(m.rehearsal.saveDialog.addsAfterItems, selected.itemCount)
                        : m.rehearsal.saveDialog.noItems
                      : undefined
                  }
                  errors={state.fieldErrors.eventId}
                >
                  <NativeSelect
                    id="eventId"
                    name="eventId"
                    required
                    value={eventId}
                    onChange={(event) => setEventId(event.target.value)}
                    aria-invalid={eventInvalid || undefined}
                    aria-describedby="eventId-description"
                  >
                    <option value="" disabled>
                      {m.rehearsal.saveDialog.selectEvent}
                    </option>
                    {upcoming.length > 0 && (
                      <optgroup label={m.rehearsal.saveDialog.upcoming}>
                        {upcoming.map((event) => (
                          <EventOptionItem key={event.id} event={event} />
                        ))}
                      </optgroup>
                    )}
                    {past.length > 0 && (
                      <optgroup label={m.rehearsal.saveDialog.past}>
                        {past.map((event) => (
                          <EventOptionItem key={event.id} event={event} />
                        ))}
                      </optgroup>
                    )}
                  </NativeSelect>
                </Field>
              ) : (
                <EventFields
                  values={{
                    title: m.rehearsal.saveDialog.defaultEventTitle,
                    startsAt: null,
                    durationMinutes: defaultDurationMinutes,
                    youtubeUrl: null,
                    isPrivate: false,
                    areaIds: null,
                  }}
                  state={state}
                  scope={scope}
                />
              )}
            </DialogBody>

            <DialogFooter>
              <FieldMessage id="items-description" errors={state.fieldErrors.items} />
              {state.message && (
                <p
                  role={state.status === "error" ? "alert" : "status"}
                  className={cn(
                    "text-sm",
                    state.status === "error" ? "text-danger" : "text-success",
                  )}
                >
                  {state.message}
                </p>
              )}
              {/* On phones the long submit text goes under the cancel button. */}
              <DialogActions>
                <Dialog.Close render={<Button type="button" variant="ghost" disabled={pending} />}>
                  {m.common.actions.cancel}
                </Dialog.Close>
                <Button type="submit" disabled={pending || rows.length === 0 || !canSave}>
                  {pending
                    ? m.common.actions.saving
                    : target === "existing" && events.length > 0
                      ? m.rehearsal.saveDialog.submitExisting
                      : m.rehearsal.saveDialog.submitNew}
                </Button>
              </DialogActions>
            </DialogFooter>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// When the page is narrow, the header button shows only its icon. Screen
// readers still read the text. The page is a container.
function HeaderLabel({ children }: { children: React.ReactNode }) {
  return <span className="sr-only @2xl:not-sr-only">{children}</span>;
}

function TargetOption({
  value,
  checked,
  onSelect,
  children,
}: {
  value: "existing" | "new";
  checked: boolean;
  onSelect: (value: "existing" | "new") => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-control px-3 py-1.5 text-center text-sm font-medium text-muted transition-colors has-focus-visible:ring-3 has-focus-visible:ring-focus/50",
        checked && "bg-surface text-text shadow-xs",
      )}
    >
      <input
        type="radio"
        name="target"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {children}
    </label>
  );
}

// Renders only in the browser (see `RehearsalBuilder`), so the date can use
// the viewer's time zone. An `<option>` can hold only text, so this does not
// use `LocalDateTime`.
function EventOptionItem({ event }: { event: EventOption }) {
  const { m, format, locale } = useI18n();
  const date = new Date(event.startsAt).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <option value={event.id}>
      {format(m.rehearsal.saveDialog.eventOption, { title: event.title, date })}
    </option>
  );
}

/** The text items, and the song rows whose song and arrangement still exist. A song can be there more than once. */
function knownRows(rows: ItemRow[], songsById: Map<string, SongWithArrangementsDTO>): ItemRow[] {
  return rows.filter(
    (row) =>
      isTextRow(row) ||
      songsById.get(row.songId)?.arrangements.some((a) => a.id === row.arrangementId),
  );
}

/** The input of `addEventItems` and `createEventWithItems` for a row: no volunteer, no theme. */
function toInput(row: ItemRow) {
  return isTextRow(row)
    ? {
        kind: "text",
        title: row.title,
        notes: row.notes,
        scripture: row.scripture,
        scriptureTranslation: scriptureTranslationInput(row),
      }
    : { kind: "song", arrangementId: row.arrangementId, musicalKey: row.musicalKey ?? null };
}

/** The rows for the printed setlist. `rows` are known rows (see `knownRows`). */
function printItems(
  i18n: I18n,
  rows: ItemRow[],
  songsById: Map<string, SongWithArrangementsDTO>,
): PrintSetlistItem[] {
  return rows.flatMap((row): PrintSetlistItem[] => {
    if (isTextRow(row)) {
      return [
        {
          kind: "text",
          title: row.title,
          notes: row.notes || null,
          scripture: row.scripture,
          scriptureTranslation: row.scriptureTranslation,
          volunteer: null,
        },
      ];
    }
    const song = songsById.get(row.songId);
    const arrangement = song?.arrangements.find((a) => a.id === row.arrangementId);
    if (!song || !arrangement) return [];
    return [
      {
        kind: "song",
        title: song.title,
        details: [song.artist, arrangement.name].filter(Boolean).join(i18n.m.common.separator),
        key: row.musicalKey ?? arrangement.key,
        bpm: arrangement.bpm,
        timeSignature: arrangement.timeSignature,
        volunteer: null,
      },
    ];
  });
}

/** For example "8 songs · 1 text item · about 35 min · 1 song without a duration". */
function summarize(
  i18n: I18n,
  rows: ItemRow[],
  songsById: Map<string, SongWithArrangementsDTO>,
): string {
  let seconds = 0;
  let unknown = 0;
  let songCount = 0;
  for (const row of rows) {
    if (isTextRow(row)) continue;
    songCount += 1;
    const arrangement = songsById
      .get(row.songId)
      ?.arrangements.find((a) => a.id === row.arrangementId);
    if (arrangement?.durationSeconds) seconds += arrangement.durationSeconds;
    else unknown += 1;
  }

  const { m, format, plural } = i18n;
  const items = formatEventItems(i18n, songCount, rows.length);
  if (seconds === 0) return items;

  const duration = i18n.duration(Math.max(1, Math.round(seconds / 60)));
  if (unknown === 0) return format(m.rehearsal.setlist.summary, { items, duration });
  return plural(m.rehearsal.setlist.summaryWithUnknown, unknown, { items, duration });
}

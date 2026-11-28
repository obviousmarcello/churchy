"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon, LibraryIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";

import { AddAnnouncementsButton } from "@/app/munkater/esemenyek/editor/announcement-item";
import {
  ImageUploadButton,
  useImageItemUpload,
  type ImageItemUpload,
} from "@/app/munkater/esemenyek/editor/event-image-upload";
import * as songActions from "@/app/munkater/enektar/uj/actions";
import { SongForm } from "@/app/munkater/enektar/song-form";
import { SongpraiseDialog } from "@/app/munkater/enektar/songpraise-dialog";
import { AddItemBox } from "@/components/music/add-item-box";
import { useModule } from "@/components/music/app-config";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_FORM_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import type { ItemRow } from "@/components/music/setlist-rows";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import {
  EVENT_ITEM_DESCRIPTION_MAX_LENGTH,
  EVENT_ITEM_HIGHLIGHT_MAX_LENGTH,
  EVENT_ITEM_TITLE_MAX_LENGTH,
} from "@/lib/music/event-items";
import { quickItemKey, type QuickItemInput } from "@/lib/music/projection/quick-items";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import type { SongpraiseSongDTO } from "@/lib/music/songpraise";
import { toastError } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import type { FormState } from "@/server/music/form-state";
import type { SongWithArrangementsDTO } from "@/server/music/models/songs";
import { listQuickAddCatalogAction, listRehearsalSongsAction } from "./actions-client";

type Catalog =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; songs: SongWithArrangementsDTO[]; newSong: { tagOptions: string[] } | null };

/** For an event admin: the items that only the event can have, e.g. an image item. */
export type QuickAddEvent = {
  eventId: string;
  /** The images of the image items of the event now, for the limit of the images. */
  imageCount: number;
  /**
   * Adds the item to the event after the live item, or after the item of
   * `afterKey`. The key of the new item, or the reason of the failure.
   */
  add: (item: QuickItemInput, afterKey?: string) => Promise<{ key: string } | { error: string }>;
  /** The upload of image items (see `useQuickAddUpload`). */
  upload: ImageItemUpload;
};

/**
 * The upload of image items of the quick add. The controller keeps it, so
 * that it goes on when the box changes, e.g. from the box of the empty
 * controller to the box above the setlist after the first item: one upload at
 * a time, with its progress and its problems in each box.
 */
export function useQuickAddUpload(event: Omit<QuickAddEvent, "upload"> | null): ImageItemUpload {
  // The image items of one upload come in the order of the files: each one after the one before it.
  const lastImageItem = useRef<string | null>(null);
  const imageUpload = useImageItemUpload({
    eventId: event?.eventId ?? "",
    imageCount: event?.imageCount ?? 0,
    // The event checks the limit of the items.
    canAdd: () => event !== null,
    addRow: async (row) => {
      if (!event || !row.imageSetId) return false;
      const result = await event.add(
        { kind: "text", title: row.title, imageSetId: row.imageSetId },
        lastImageItem.current ?? undefined,
      );
      // The reason goes in the problems of the upload. The cleanup deletes the set without an item (see `event-images.ts`).
      if ("error" in result) return result.error;
      lastImageItem.current = result.key;
      return true;
    },
    // No drop on the controller: only the button.
    dropTarget: NO_ELEMENT,
  });
  return {
    ...imageUpload,
    upload: (files: File[]) => {
      lastImageItem.current = null;
      imageUpload.upload(files);
    },
  };
}

/**
 * The "Quick add" box of the controller: search for a song, or type a
 * scripture reference, e.g. a passage that the preacher reads, or the title of
 * a text item or a text slide. A text slide opens a dialog for its text. It
 * has the focus when the controller opens. A scripture reading can be added
 * while the songs load. Song admins can also add a new song to the catalog
 * here, also with the lyrics of SongPraise: it then comes on the projection
 * as the other songs of the box. With `event`, the buttons next to the field
 * add image items (images, PDF and PowerPoint files) and announcements items
 * to the event, as on the event page.
 */
export function QuickAddBox({
  onAdd,
  event = null,
  className,
}: {
  /** `item`: the quick item as an item of the event. A promise: the box waits for it. */
  onAdd: (source: ProjectionSource, item: QuickItemInput) => void | Promise<void>;
  event?: QuickAddEvent | null;
  className?: string;
}) {
  const { m } = useI18n();
  const t = m.project.quickAdd;
  // The text slide in the dialog, with the typed text as its title. Null while the dialog is closed.
  const [textSlide, setTextSlide] = useState<{ title: string; key: string } | null>(null);
  const upload = event?.upload;
  // The add buttons of the image and announcement items only with their modules.
  const imagesOn = useModule("projection.images");
  const announcementsOn = useModule("projection.announcements");
  const [catalog, setCatalog] = useState<Catalog>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState<"song" | "item" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The "New song" dialog, with the typed text as the title of the song. Null while the dialog is closed.
  const [newSong, setNewSong] = useState<NewSongRequest | null>(null);
  // The search of SongPraise for a new song, with the typed text. Null while the dialog is closed.
  const [songpraiseQuery, setSongpraiseQuery] = useState<string | null>(null);
  // The song can load after the controller changed, e.g. after a long time in the "New song" dialog.
  const onAddRef = useRef(onAdd);
  useLayoutEffect(() => {
    onAddRef.current = onAdd;
  });

  useEffect(() => {
    let active = true;
    listQuickAddCatalogAction().then(
      (result) =>
        active &&
        setCatalog(
          result.status === "success"
            ? { status: "ready", songs: result.catalog, newSong: result.newSong }
            : result,
        ),
      () => active && setCatalog({ status: "error", message: t.loadFailed }),
    );
    return () => {
      active = false;
    };
  }, [attempt, t.loadFailed]);

  async function add(row: ItemRow) {
    setError(null);
    if (row.kind === "text" && row.textSlide) {
      setTextSlide({ title: row.title, key: crypto.randomUUID() });
      return;
    }
    if (row.kind === "text") {
      const key = quickItemKey();
      setAdding("item");
      try {
        await onAdd(
          {
            kind: "text",
            key,
            title: row.title,
            scripture: row.scripture,
            translation: row.scriptureTranslation,
          },
          {
            kind: "text",
            title: row.title,
            scripture: row.scripture,
            scriptureTranslation: row.scriptureTranslation,
          },
        );
      } finally {
        setAdding(null);
      }
      return;
    }
    await addSong(row.arrangementId);
  }

  async function addTextSlide({
    title,
    description,
    highlight,
  }: {
    title: string;
    description: string;
    highlight: string;
  }) {
    const key = quickItemKey();
    setError(null);
    setAdding("item");
    try {
      await onAddRef.current(
        {
          kind: "textSlide",
          key,
          title,
          description: description || null,
          highlight: highlight || null,
        },
        { kind: "text", title, textSlide: true, description, highlight },
      );
    } finally {
      setAdding(null);
    }
  }

  async function addAnnouncements(announcementId: string) {
    if (!event) return;
    setAdding("item");
    try {
      const result = await event.add({
        kind: "text",
        title: m.announcements.editor.defaultTitle,
        announcementId,
      });
      if ("error" in result) toastError(result.error);
    } finally {
      setAdding(null);
    }
  }

  async function addSong(arrangementId: string) {
    const key = quickItemKey();
    setError(null);
    // The catalog has only the summaries of the arrangements: the chart loads now.
    setAdding("song");
    try {
      const result = await listRehearsalSongsAction([arrangementId]);
      const song = result.status === "success" ? result.songs[0] : undefined;
      if (song) {
        const {
          title,
          copyright,
          songbook,
          artist,
          authors,
          chordpro,
          sectionOrder,
          arrangementThemeId,
        } = song;
        await onAddRef.current(
          {
            kind: "song",
            key,
            title,
            copyright,
            songbook,
            artist,
            authors,
            chordpro,
            sectionOrder,
            arrangementThemeId,
          },
          { kind: "song", arrangementId },
        );
      } else {
        setError(result.status === "error" ? result.message : t.songNotFound);
      }
    } catch {
      setError(t.songFailed);
    } finally {
      setAdding(null);
    }
  }

  const note =
    catalog.status === "loading" ? (
      <Status>{t.loading}</Status>
    ) : catalog.status === "error" ? (
      <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
        <span className="min-w-0 flex-1">{catalog.message}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setCatalog({ status: "loading" });
            setAttempt((count) => count + 1);
          }}
        >
          {t.retry}
        </Button>
      </p>
    ) : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <AddItemBox
        catalog={catalog.status === "ready" ? catalog.songs : []}
        rows={[]}
        onAdd={(row) => void add(row)}
        canAddSongs={false}
        label={t.label}
        placeholder={t.placeholder}
        autoFocus
        note={note}
        textSlides
        inputAction={
          event || (catalog.status === "ready" && catalog.newSong)
            ? (query) => (
                <>
                  {upload && imagesOn && <ImageUploadButton upload={upload} />}
                  {event && announcementsOn && (
                    <AddAnnouncementsButton
                      eventId={event.eventId}
                      disabled={adding !== null}
                      onCreated={(id) => void addAnnouncements(id)}
                    />
                  )}
                  {catalog.status === "ready" && catalog.newSong && (
                    <NewSongButtons
                      onNewSong={() => setNewSong({ title: query, key: crypto.randomUUID() })}
                      onSongpraise={() => setSongpraiseQuery(query)}
                    />
                  )}
                </>
              )
            : undefined
        }
      />
      {adding && <Status>{adding === "song" ? t.addingSong : t.addingItem}</Status>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {upload && upload.errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {upload.errors.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </div>
      )}
      <TextSlideDialog
        request={textSlide}
        onClose={() => setTextSlide(null)}
        onAdd={(slide) => void addTextSlide(slide)}
      />
      {catalog.status === "ready" && catalog.newSong && (
        <SongpraiseDialog
          open={songpraiseQuery !== null}
          onOpenChange={(open) => {
            if (!open) setSongpraiseQuery(null);
          }}
          getTitle={() => songpraiseQuery ?? ""}
          isChartEmpty={() => true}
          insertLabel={t.songpraiseContinue}
          onInsert={(song) =>
            setNewSong({ title: song.title, key: crypto.randomUUID(), songpraise: song })
          }
        />
      )}
      {catalog.status === "ready" && catalog.newSong && (
        <NewSongDialog
          request={newSong}
          tagOptions={catalog.newSong.tagOptions}
          onClose={() => setNewSong(null)}
          onCreated={(arrangementId) => {
            // The new song is in the suggestions too.
            setAttempt((count) => count + 1);
            void addSong(arrangementId);
          }}
        />
      )}
    </div>
  );
}

/**
 * `key`: a new form for each opening, so it starts with the typed title.
 * `songpraise`: the song from SongPraise, whose lyrics the form starts with.
 */
type NewSongRequest = { title: string; key: string; songpraise?: SongpraiseSongDTO };

/** "New song" with an arrow button next to it. The arrow opens a menu with "New song from SongPraise". */
function NewSongButtons({
  onNewSong,
  onSongpraise,
}: {
  onNewSong: () => void;
  onSongpraise: () => void;
}) {
  const { m } = useI18n();
  const t = m.project.quickAdd;

  return (
    <div data-slot="button-group" className="flex shrink-0">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-r-none"
        aria-label={t.newSong}
        title={t.newSong}
        onClick={onNewSong}
      >
        <PlusIcon />
      </Button>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="w-6 rounded-l-none border-l-0 pointer-coarse:w-7"
              aria-label={t.moreNewSongOptions}
              title={t.moreNewSongOptions}
            />
          }
        >
          <ChevronDownIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={6} align="end" collisionPadding={8} className="z-50">
            <Menu.Popup className="min-w-48 origin-[var(--transform-origin)] rounded-card border bg-surface-raised p-1 text-text shadow-lg outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Menu.Item
                closeOnClick
                onClick={onNewSong}
                className="flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
              >
                <PlusIcon />
                {t.newSong}
              </Menu.Item>
              <Menu.Item
                closeOnClick
                onClick={onSongpraise}
                className="flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-surface-sunken [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
              >
                <LibraryIcon />
                {t.newSongFromSongpraise}
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/**
 * Adds a song to the catalog, as the "New song" page. Open while `request` is
 * set. After a save, the dialog closes and the song comes on the projection.
 */
function NewSongDialog({
  request,
  tagOptions,
  onClose,
  onCreated,
}: {
  request: NewSongRequest | null;
  tagOptions: string[];
  onClose: () => void;
  onCreated: (arrangementId: string) => void;
}) {
  const { m } = useI18n();
  const t = m.project.quickAdd;
  // Keep the last form while the dialog animates out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const onCreatedRef = useRef(onCreated);
  useLayoutEffect(() => {
    onCreatedRef.current = onCreated;
  });

  async function create(previous: FormState, formData: FormData): Promise<FormState> {
    const outcome = await songActions.createSongInPlaceAction(previous, formData);
    const result = outcome.ok
      ? outcome.value
      : ({ status: "error", message: "", fieldErrors: {} } as FormState & {
          arrangementId?: string;
        });
    if (result.status === "success" && result.arrangementId)
      onCreatedRef.current(result.arrangementId);
    return result;
  }

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-2xl")}>
          <DialogHeader>
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {t.newSong}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              {t.newSongDescription}
            </Dialog.Description>
          </DialogHeader>
          {shown && (
            <SongForm
              key={shown.key}
              action={create}
              submitLabel={m.songs.new.submit}
              pendingLabel={m.songs.new.pending}
              cancel={onClose}
              onSaved={onClose}
              tagOptions={tagOptions}
              initialTitle={shown.title}
              initialChart={
                shown.songpraise && {
                  source: "songpraise",
                  chordpro: shown.songpraise.chordpro,
                  sectionOrder: shown.songpraise.sectionOrder,
                  songbook: shown.songpraise.songbook,
                }
              }
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const NO_ELEMENT: React.RefObject<HTMLElement | null> = { current: null };

type TextSlideInput = { title: string; description: string; highlight: string };

/**
 * The title, the description and the highlighted text of a new text slide.
 * Open while `request` is set: it starts with the typed text as the title.
 */
function TextSlideDialog({
  request,
  onClose,
  onAdd,
}: {
  request: { title: string; key: string } | null;
  onClose: () => void;
  onAdd: (slide: TextSlideInput) => void;
}) {
  const { m } = useI18n();
  const t = m.project.quickAdd;
  const rows = m.components.setlistRows;
  // Keep the last form while the dialog animates out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);

  return (
    <Dialog.Root
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader>
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {t.textSlideTitle}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              {t.textSlideDescription}
            </Dialog.Description>
          </DialogHeader>
          {shown && (
            <TextSlideForm
              key={shown.key}
              initialTitle={shown.title}
              onCancel={onClose}
              onSubmit={(slide) => {
                onAdd(slide);
                onClose();
              }}
              labels={{
                title: t.textSlideTitleLabel,
                titlePlaceholder: rows.textSlideTitlePlaceholder,
                description: t.textSlideDescriptionLabel,
                descriptionPlaceholder: rows.textSlideDescriptionPlaceholder,
                highlight: t.textSlideHighlightLabel,
                highlightPlaceholder: rows.textSlideHighlightPlaceholder,
                empty: rows.textSlideEmpty,
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TextSlideForm({
  initialTitle,
  onCancel,
  onSubmit,
  labels,
}: {
  initialTitle: string;
  onCancel: () => void;
  onSubmit: (slide: TextSlideInput) => void;
  labels: Record<
    | "title"
    | "titlePlaceholder"
    | "description"
    | "descriptionPlaceholder"
    | "highlight"
    | "highlightPlaceholder"
    | "empty",
    string
  >;
}) {
  const { m } = useI18n();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [highlight, setHighlight] = useState("");
  const empty = description.trim() === "" && highlight.trim() === "";

  return (
    <form
      className={DIALOG_FORM_CLASS}
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === "") return;
        onSubmit({
          title: title.trim(),
          description: description.trim(),
          highlight: highlight.trim(),
        });
      }}
    >
      <DialogBody>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quickTextSlideTitle">{labels.title}</Label>
          <Input
            id="quickTextSlideTitle"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={labels.titlePlaceholder}
            maxLength={EVENT_ITEM_TITLE_MAX_LENGTH}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quickTextSlideDescription">{labels.description}</Label>
          <Textarea
            id="quickTextSlideDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={labels.descriptionPlaceholder}
            maxLength={EVENT_ITEM_DESCRIPTION_MAX_LENGTH}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quickTextSlideHighlight">{labels.highlight}</Label>
          <Textarea
            id="quickTextSlideHighlight"
            value={highlight}
            onChange={(event) => setHighlight(event.target.value)}
            placeholder={labels.highlightPlaceholder}
            maxLength={EVENT_ITEM_HIGHLIGHT_MAX_LENGTH}
          />
        </div>
        {empty && <p className="text-sm text-muted">{labels.empty}</p>}
      </DialogBody>
      <DialogFooter>
        <DialogActions>
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.common.actions.cancel}
          </Button>
          <Button type="submit" disabled={title.trim() === ""}>
            {m.common.actions.add}
          </Button>
        </DialogActions>
      </DialogFooter>
    </form>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin" />
      {children}
    </p>
  );
}

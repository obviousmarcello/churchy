"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ChevronDownIcon, LoaderCircleIcon, PlusIcon, XIcon } from "lucide-react";

import { PreviewLayout } from "@/components/music/preview-layout";
import { DIALOG_FORM_CLASS, DialogBody, DialogFooter } from "@/components/music/dialog-parts";
import { Field, FieldMessage, SectionHeading } from "@/components/music/form-field";
import { useResultToast } from "@/components/music/form-parts";
import { ChartPreview } from "./chart-preview";
import { invalidatePageCache } from "@/components/music/page-cache";
import { SaveBar, usePageSaveForm } from "@/components/music/page-save";
import { PageCard } from "@/components/music/page-card";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { useNoteNames } from "@/components/music/note-names";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import { parseChordProSections } from "@/lib/music/chordpro";
import { convertPlainChart } from "@/lib/music/chords-over-lyrics";
import { explicitNotation, fromEnglish } from "@/lib/music/chords/notation";
import { SONG_COPYRIGHT_MAX_LENGTH } from "@/lib/music/song-copyright";
import {
  DEFAULT_SONG_RIGHTS_STATUS,
  SONG_AUTHORS_MAX_LENGTH,
  SONG_ORIGINAL_TITLE_MAX_LENGTH,
  SONG_RIGHTS_NOTE_MAX_LENGTH,
  SONG_RIGHTS_STATUSES,
  SONG_TRANSLATOR_MAX_LENGTH,
  type SongRightsStatus,
} from "@/lib/music/song-rights";
import { SONG_SONGBOOK_MAX_LENGTH } from "@/lib/music/song-songbook";
import { formatMinutesSeconds } from "@/lib/music/format";
import { changedPages } from "@/lib/music/page-keys";
import { cn } from "@/lib/music/utils";
import { appendChart, type SongpraiseSongDTO } from "@/lib/music/songpraise";
import { ModuleGate } from "@/components/music/app-config";
import type { SongImageDTO } from "@/server/music/models/images";
import type { ArrangementDTO } from "@/server/music/models/arrangements";
import type { SharedSongRightsDTO } from "@/server/music/models/songs";
import type { FormState } from "@/server/music/form-state";
import { ReadChartDialog } from "./read-chart-dialog";
import { SongpraiseDialog } from "./songpraise-dialog";
import { TagInput } from "./tag-input";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * The chart and the order before "Read from image" or "Lyrics from SongPraise"
 * put a chart in. `filled`: the values that the insert put into empty fields.
 */
type BeforeInsert = {
  source: "ocr" | "songpraise";
  chordpro: string;
  sectionOrder: string[];
  filled: { title?: string; songbook?: string };
};

/** Puts a chart from "Read from image" into the chart field, e.g. from the list of images. */
export type ChartHandle = {
  isEmpty: () => boolean;
  /** `replace` is false to put the chart after the chart of the field. */
  insert: (chart: string, replace: boolean) => void;
};

/** The song to edit and the arrangement to edit with it. */
export type SongFormValues = {
  id: string;
  title: string;
  artist: string | null;
  tags: string[];
  copyright: string | null;
  songbook: string | null;
  authors: string | null;
  originalTitle: string | null;
  translator: string | null;
  rightsStatus: SongRightsStatus;
  rightsNote: string | null;
  arrangement: ArrangementDTO;
  /** The projection themes, for the theme of the arrangement. Without them, the form has no theme field and keeps the theme. */
  themes?: { id: string; name: string }[];
};

/** The buttons of the form. Embedded, the form has no buttons. */
type SongFormButtons =
  | {
      submitLabel: string;
      pendingLabel: string;
      /** A link on a page, or a function in a dialog. */
      cancel: string | (() => void);
      embedded?: false;
    }
  | {
      submitLabel?: never;
      pendingLabel?: never;
      cancel?: never;
      /** In a `PageSave`: the save button of the page saves the form. */
      embedded: true;
    };

/**
 * The fields of a song and the content of one arrangement. Without `song`
 * it adds a song with its default arrangement; with `song` it edits them.
 * On a page it shows in a card (`card` false leaves out the card), and
 * `cancel` is a link. In a dialog, `cancel` is a function, and `onSaved`
 * closes the dialog after a save. With `embedded`, the form has no buttons:
 * the save button of the page (`PageSave`) saves it with `action`, which must
 * not redirect.
 */
export function SongForm({
  action,
  song,
  submitLabel,
  pendingLabel,
  cancel,
  card = true,
  onSaved,
  chartHandle,
  images,
  tagOptions = [],
  initialTitle,
  initialChart,
  embedded = false,
  sharedRights = null,
}: SongFormButtons & {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  song?: SongFormValues;
  /** On a page: false shows the form without its card, e.g. in a panel of the edit page. */
  card?: boolean;
  /** Called after a save that returns a success, e.g. to close the dialog. */
  onSaved?: () => void;
  /** The facts of the shared song-rights catalog for this song (Churchy): "Fill from the catalog". */
  sharedRights?: SharedSongRightsDTO | null;
  /** Lets other parts of the page put a chart into the chart field. */
  chartHandle?: React.Ref<ChartHandle>;
  /** The images of the song, which "Read from image" can read. */
  images?: SongImageDTO[];
  /** The suggestions of the tag field, e.g. the tags of all songs. */
  tagOptions?: string[];
  /** The title of a new song (without `song`), e.g. from the search palette. */
  initialTitle?: string;
  /** The chart of a new song (without `song`), e.g. from SongPraise. The form asks the user to check it. */
  initialChart?: {
    source: "songpraise";
    chordpro: string;
    sectionOrder: string[];
    songbook: string | null;
  };
}) {
  const i18n = useI18n();
  const { m, format } = i18n;
  const t = m.songs.form;
  const inDialog = typeof cancel === "function";
  const [chordpro, setChordpro] = useState(
    song?.arrangement.chordpro ?? initialChart?.chordpro ?? "",
  );
  const [sectionOrder, setSectionOrder] = useState<string[]>(
    song?.arrangement.sectionOrder ?? initialChart?.sectionOrder ?? [],
  );
  // The chart as a plain paste would have left it, while the converted paste
  // is the last change. "Undo conversion" restores it.
  const [plainPaste, setPlainPaste] = useState<string | null>(null);
  // After "Undo conversion", the server keeps plain section headers as lyrics.
  const [keepPlainSections, setKeepPlainSections] = useState(false);
  // The chart and the order before "Read from image" or "Lyrics from SongPraise" put a chart in,
  // while that is the last change. "Undo" restores them.
  const [beforeInsert, setBeforeInsert] = useState<BeforeInsert | null>(() =>
    initialChart && !song
      ? {
          source: initialChart.source,
          chordpro: "",
          sectionOrder: [],
          filled: { songbook: initialChart.songbook ?? undefined },
        }
      : null,
  );
  // The fields that the preview shows. Empty detail fields keep the values of the chart.
  const [previewFields, setPreviewFields] = useState({
    title: song?.title ?? initialTitle ?? "",
    artist: song?.artist ?? "",
    key: "",
    bpm: "",
    timeSignature: "",
  });
  // The rights part is open when the song has rights data, and after an error in it.
  const [rightsOpen, setRightsOpen] = useState(() => hasRightsData(song));
  /** After a save: the rights part opens for its errors, and the chart shows as saved. */
  function handleResult(next: FormState, formData: FormData) {
    if (RIGHTS_FIELDS.some((field) => (next.fieldErrors[field]?.length ?? 0) > 0))
      setRightsOpen(true);
    if (next.status !== "success") return;
    // The server converted plain section headers and chord lines, unless the form asked it to keep them.
    // The field shows the chart as saved.
    const submitted = formData.get("chordpro");
    const result = convertPlainChart(typeof submitted === "string" ? submitted : "");
    if (result.converted && formData.get("keepPlainSections") !== "true")
      setChordpro(result.chordpro);
    setPlainPaste(null);
    setBeforeInsert(null);
    onSaved?.();
  }

  const [actionState, formAction, actionPending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      invalidatePageCache(changedPages.songs());
      const next = await action(previous, formData);
      handleResult(next, formData);
      return next;
    },
    initialState,
  );

  // Embedded: the save button of the page calls `saveEmbedded`.
  const formRef = useRef<HTMLFormElement>(null);
  const [embeddedState, setEmbeddedState] = useState(initialState);
  const [embeddedPending, setEmbeddedPending] = useState(false);
  async function saveEmbedded(form: HTMLFormElement): Promise<boolean> {
    const formData = new FormData(form);
    setEmbeddedPending(true);
    invalidatePageCache(changedPages.songs());
    let next: FormState;
    try {
      next = await action(embeddedState, formData);
    } catch {
      // The request failed, e.g. without a connection.
      next = { status: "error", message: m.common.errors.generic, fieldErrors: {} };
    }
    setEmbeddedPending(false);
    setEmbeddedState(next);
    handleResult(next, formData);
    return next.status === "success";
  }
  const pageSave = usePageSaveForm({
    formRef,
    save: saveEmbedded,
    enabled: embedded,
    leaves: true,
  });
  const state = embedded ? embeddedState : actionState;
  const pending = embedded ? embeddedPending : actionPending;
  // Embedded, the page leaves after the save: no toast.
  useResultToast(embedded ? initialState : state);
  const chordproRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const songbookRef = useRef<HTMLInputElement>(null);
  const pasteCaret = useRef<number | null>(null);
  const current = song?.arrangement;
  // The note names of the chart. A new song starts with the user's note names.
  const noteNames = useNoteNames();
  const [notation, setNotation] = useState<string | null>(null);
  const notationValue =
    notation ?? (song ? (explicitNotation(song.arrangement.chordpro) ?? "auto") : noteNames);
  // The keys of the chart in its own note names, as the fields take them.
  const chartKey = (key: string) => (current ? fromEnglish(key, current.notation) : key);

  /** Puts the text of "Read from image" into the chart. "Undo" restores the chart as it was. */
  function insertChart(chart: string, replace: boolean) {
    setBeforeInsert({ source: "ocr", chordpro, sectionOrder, filled: {} });
    setChordpro(replace ? chart : `${chordpro.trimEnd()}\n\n${chart}`);
    setPlainPaste(null);
    setKeepPlainSections(false);
  }

  /**
   * Puts the lyrics of "Lyrics from SongPraise" into the chart, with the playing
   * order of SongPraise, and its title and songbook into the empty fields.
   * After the chart, the new sections get free labels (see `appendChart`).
   */
  function insertSongpraise(song: SongpraiseSongDTO, replace: boolean) {
    const next = replace ? song : appendChart({ chordpro, sectionOrder }, song);
    const filled: BeforeInsert["filled"] = {};
    const title = titleRef.current;
    if (title && title.value.trim() === "") {
      title.value = filled.title = song.title;
      setPreviewFields((fields) => ({ ...fields, title: song.title }));
    }
    const songbook = songbookRef.current;
    if (songbook && song.songbook && songbook.value.trim() === "")
      songbook.value = filled.songbook = song.songbook;
    setBeforeInsert({ source: "songpraise", chordpro, sectionOrder, filled });
    setChordpro(next.chordpro);
    setSectionOrder(next.sectionOrder);
    setPlainPaste(null);
    setKeepPlainSections(false);
  }

  /** "Undo": the chart and the order as they were, and empty fields again where the insert filled them. */
  function undoInsert(before: BeforeInsert) {
    setChordpro(before.chordpro);
    setSectionOrder(before.sectionOrder);
    const title = titleRef.current;
    if (title && before.filled.title !== undefined && title.value === before.filled.title) {
      title.value = "";
      setPreviewFields((fields) => ({ ...fields, title: "" }));
    }
    const songbook = songbookRef.current;
    if (
      songbook &&
      before.filled.songbook !== undefined &&
      songbook.value === before.filled.songbook
    ) {
      songbook.value = "";
    }
    setBeforeInsert(null);
  }

  useImperativeHandle(chartHandle, () => ({
    isEmpty: () => chordpro.trim() === "",
    insert: (chart, replace) => {
      insertChart(chart, replace);
      // From another part of the page: show the chart, which the user must check.
      chordproRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      chordproRef.current?.focus({ preventScroll: true });
    },
  }));

  // Puts the caret after the converted paste, as after a native paste.
  useLayoutEffect(() => {
    if (pasteCaret.current === null) return;
    chordproRef.current?.setSelectionRange(pasteCaret.current, pasteCaret.current);
    pasteCaret.current = null;
  }, [chordpro]);

  // Changes that send no event in the form, e.g. a chart from "Read text" of an image.
  const recheck = pageSave.recheck;
  useEffect(() => recheck(), [chordpro, sectionOrder, notation, recheck]);

  // A link to the rights part, e.g. in the list of parts of the edit page, opens it.
  useEffect(() => {
    const openRights = () => {
      if (window.location.hash === "#rights") setRightsOpen(true);
    };
    // A second click on the link does not change the hash, e.g. after the user closed the part.
    const openOnClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link?.getAttribute("href") === "#rights") setRightsOpen(true);
    };
    openRights();
    window.addEventListener("hashchange", openRights);
    document.addEventListener("click", openOnClick);
    return () => {
      window.removeEventListener("hashchange", openRights);
      document.removeEventListener("click", openOnClick);
    };
  }, []);

  const labels = parseChordProSections(chordpro).map((section) => section.label);
  const distinctLabels = [...new Set(labels)];
  const knownLabels = new Set(labels.map((label) => label.toLowerCase()));

  // Submits without the automatic form reset, so the fields keep their
  // values when the server rejects them.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (embedded) return pageSave.onSubmit(event);
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  // Converts a pasted chart with plain section headers (VERSE 1, CHORUS) or
  // chord lines above the lyrics to ChordPro. Other pastes stay native.
  function handleChordproPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    const result = convertPlainChart(pasted);
    if (!result.converted) return;

    event.preventDefault();
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    const before = value.slice(0, selectionStart);
    const after = value.slice(selectionEnd);
    setPlainPaste(before + pasted + after);
    setBeforeInsert(null);
    setChordpro(before + result.chordpro + after);
    pasteCaret.current = before.length + result.chordpro.length;
  }

  // "Convert to ChordPro": the chart in the field, e.g. typed with chord lines. Only when it has something to convert.
  const plainChart = convertPlainChart(chordpro);
  function convertChart() {
    setPlainPaste(chordpro);
    setBeforeInsert(null);
    setKeepPlainSections(false);
    setChordpro(plainChart.chordpro);
  }

  function trackPreviewField(event: React.FormEvent<HTMLFormElement>) {
    const { name, value } = event.target as HTMLInputElement;
    if (name in previewFields) setPreviewFields((fields) => ({ ...fields, [name]: value }));
  }

  function fieldProps(name: string, errorKey = name) {
    const invalid = (state.fieldErrors[errorKey]?.length ?? 0) > 0;
    return {
      id: name,
      name,
      "aria-invalid": invalid || undefined,
      "aria-describedby": `${name}-description`,
    };
  }

  // Cmd/Ctrl + Enter saves from any field, also from the chart.
  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    // Embedded: the page saves all its forms.
    if (embedded || event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || pending) return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  const cancelButton =
    typeof cancel === "function" ? (
      <Button type="button" variant={inDialog ? "ghost" : "outline"} onClick={cancel}>
        {m.common.actions.cancel}
      </Button>
    ) : (
      cancel !== undefined && (
        <Link href={cancel} className={buttonVariants({ variant: "outline" })}>
          {m.common.actions.cancel}
        </Link>
      )
    );
  const submitButton = (
    <Button type="submit" disabled={pending}>
      {pending && <LoaderCircleIcon className="animate-spin" />}
      {pending ? pendingLabel : submitLabel}
    </Button>
  );

  const form = (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={trackPreviewField}
      onKeyDown={handleKeyDown}
      className={inDialog ? DIALOG_FORM_CLASS : "@container flex flex-col gap-8"}
    >
      {song && (
        <>
          <input type="hidden" name="id" value={song.id} />
          <input type="hidden" name="arrangementId" value={song.arrangement.id} />
        </>
      )}
      {keepPlainSections && <input type="hidden" name="keepPlainSections" value="true" />}
      <DialogBodyIf inDialog={inDialog}>
        {/* The editor keeps its width. On a page, the preview stays next to it on a wide screen, or goes under it. */}
        <PreviewLayout
          preview={
            !inDialog && (
              <ChartPreview
                chordpro={chordpro}
                sectionOrder={sectionOrder}
                title={previewFields.title}
                artist={previewFields.artist}
                musicalKey={previewFields.key}
                bpm={previewFields.bpm}
                timeSignature={previewFields.timeSignature}
              />
            )
          }
        >
          {/* The ids are the targets of the list of parts of the edit page. */}
          <section id="song" aria-label={t.song} className="flex scroll-mt-32 flex-col gap-4">
            {/* The one required field of the song: almost all the others are optional. */}
            <Field
              name="title"
              label={`${t.title} (${m.common.form.required})`}
              errors={state.fieldErrors.title}
            >
              <Input
                {...fieldProps("title")}
                ref={titleRef}
                defaultValue={song?.title ?? initialTitle}
                required
                maxLength={200}
                className="h-11 font-heading text-lg font-semibold md:text-lg"
                // A dialog moves the focus into itself.
                autoFocus={!inDialog}
              />
            </Field>
            <div className="grid gap-4 @md:grid-cols-2">
              <Field name="artist" label={t.artist} errors={state.fieldErrors.artist}>
                <Input
                  {...fieldProps("artist")}
                  defaultValue={song?.artist ?? undefined}
                  maxLength={200}
                />
              </Field>
              <Field name="authors" label={t.authors} errors={state.fieldErrors.authors}>
                <Input
                  {...fieldProps("authors")}
                  defaultValue={song?.authors ?? undefined}
                  maxLength={SONG_AUTHORS_MAX_LENGTH}
                />
              </Field>
              {/* Next to the authors, not in the closed Rights part: a translation shows its translator. */}
              <Field name="translator" label={t.translator} errors={state.fieldErrors.translator}>
                <Input
                  {...fieldProps("translator")}
                  defaultValue={song?.translator ?? undefined}
                  maxLength={SONG_TRANSLATOR_MAX_LENGTH}
                />
              </Field>
              <Field name="songbook" label={t.songbook} errors={state.fieldErrors.songbook}>
                <Input
                  {...fieldProps("songbook")}
                  ref={songbookRef}
                  defaultValue={song?.songbook ?? initialChart?.songbook ?? undefined}
                  maxLength={SONG_SONGBOOK_MAX_LENGTH}
                />
              </Field>
              <Field name="tags" label={t.tags} errors={state.fieldErrors.tags}>
                <TagInput
                  id="tags"
                  defaultTags={song?.tags ?? []}
                  options={tagOptions}
                  invalid={(state.fieldErrors.tags?.length ?? 0) > 0}
                />
              </Field>
            </div>
          </section>

          {/* The chart with its tools and its playing order, in one box. */}
          <section
            id="chart"
            aria-labelledby="chart-heading"
            className="flex scroll-mt-32 flex-col gap-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="chart-heading" className="font-heading text-fs-5 font-bold tracking-tight">
                <label htmlFor="chordpro">{t.chart}</label>
              </h2>
              <div className="flex flex-wrap gap-2">
                {plainChart.converted && (
                  <Button type="button" variant="outline" size="sm" onClick={convertChart}>
                    {t.convertChart}
                  </Button>
                )}
                <SongpraiseDialog
                  getTitle={() => titleRef.current?.value ?? ""}
                  isChartEmpty={() => chordpro.trim() === ""}
                  onInsert={insertSongpraise}
                />
                <ModuleGate id="songs.ocr">
                  <ReadChartDialog
                    images={images}
                    isChartEmpty={() => chordpro.trim() === ""}
                    onInsert={insertChart}
                  />
                </ModuleGate>
              </div>
            </div>
            <div className="overflow-hidden rounded-card border bg-surface-raised has-[textarea:focus-visible]:ring-3 has-[textarea:focus-visible]:ring-focus/50">
              <Textarea
                {...fieldProps("chordpro")}
                ref={chordproRef}
                value={chordpro}
                onChange={(event) => {
                  setChordpro(event.target.value);
                  setPlainPaste(null);
                  setBeforeInsert(null);
                }}
                onPaste={handleChordproPaste}
                placeholder={t.chordproPlaceholder}
                spellCheck={false}
                className="min-h-80 rounded-none border-0 bg-transparent font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              {/* The hint and the errors of the chart directly below it, above the playing order. */}
              <div className="border-t px-3 py-2">
                <FieldMessage
                  id="chordpro-description"
                  hint={t.chordproHint}
                  errors={state.fieldErrors.chordpro}
                />
              </div>
              <fieldset
                id="playing-order"
                className="flex scroll-mt-32 flex-col gap-3 border-t bg-surface-sunken/50 px-3 py-3"
              >
                <legend className="sr-only">{t.playingOrder}</legend>
                <div className="flex flex-col gap-1.5 @md:flex-row @md:items-start @md:gap-3">
                  <p aria-hidden className="shrink-0 pt-1 text-sm font-medium @md:w-32">
                    {t.playingOrder}
                  </p>
                  {sectionOrder.length > 0 ? (
                    <ol aria-label={t.order} className="flex flex-wrap gap-1.5">
                      {sectionOrder.map((label, index) => {
                        const missing = !knownLabels.has(label.toLowerCase());
                        return (
                          <li
                            key={`${index}-${label}`}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded-control bg-surface-sunken pr-1 pl-2.5 text-[0.8rem] text-text",
                              missing && "bg-danger/10 text-danger",
                            )}
                            title={missing ? t.missingSection : undefined}
                          >
                            <span className="text-muted tabular-nums">{index + 1}.</span>
                            {label}
                            <input type="hidden" name="sectionOrder" value={label} />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={format(t.removeSection, { label, position: index + 1 })}
                              onClick={() => {
                                setSectionOrder((order) => order.toSpliced(index, 1));
                                setBeforeInsert(null);
                              }}
                            >
                              <XIcon />
                            </Button>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="pt-1 text-sm text-muted">{t.noOrder}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 @md:flex-row @md:items-start @md:gap-3">
                  <p aria-hidden className="shrink-0 pt-1 text-sm text-muted @md:w-32">
                    {t.chartSections}
                  </p>
                  {distinctLabels.length > 0 ? (
                    <ul aria-label={t.chartSections} className="flex flex-wrap gap-1.5">
                      {distinctLabels.map((label) => (
                        <li key={label}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSectionOrder((order) => [...order, label]);
                              setBeforeInsert(null);
                            }}
                          >
                            <PlusIcon />
                            {label}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pt-1 text-sm text-muted">{t.noSections}</p>
                  )}
                </div>
                {distinctLabels.length < labels.length && (
                  <p className="text-sm text-muted">{t.duplicateLabels}</p>
                )}
                <FieldMessage
                  id="sectionOrder-description"
                  errors={state.fieldErrors.sectionOrder}
                />
              </fieldset>
            </div>
            <div role="status" className="empty:hidden">
              {beforeInsert !== null && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {beforeInsert.source === "songpraise" ? t.songpraiseInserted : t.ocrInserted}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => undoInsert(beforeInsert)}
                  >
                    {t.undoOcr}
                  </Button>
                </p>
              )}
              {plainPaste !== null && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {t.pasteConverted}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setChordpro(plainPaste);
                      setPlainPaste(null);
                      setKeepPlainSections(true);
                    }}
                  >
                    {t.undoPasteConversion}
                  </Button>
                </p>
              )}
            </div>
          </section>

          {/* An empty field keeps the value of the chart: the placeholder shows it. */}
          <section id="details" className="flex scroll-mt-32 flex-col gap-4">
            <SectionHeading title={t.details} />
            <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
              <Field name="key" label={t.key} errors={state.fieldErrors.key}>
                <Input
                  {...fieldProps("key")}
                  placeholder={detailPlaceholder(
                    i18n,
                    current && (current.key ? chartKey(current.key) : null),
                    "G",
                  )}
                />
              </Field>
              <Field name="bpm" label={t.tempo} errors={state.fieldErrors.bpm}>
                <Input
                  {...fieldProps("bpm")}
                  type="number"
                  min={1}
                  max={400}
                  step={1}
                  placeholder={detailPlaceholder(
                    i18n,
                    current ? String(current.bpm ?? "") : undefined,
                    "72",
                  )}
                />
              </Field>
              <Field
                name="timeSignature"
                label={t.timeSignature}
                errors={state.fieldErrors.timeSignature}
              >
                <Input
                  {...fieldProps("timeSignature")}
                  placeholder={detailPlaceholder(i18n, current?.timeSignature, "4/4")}
                />
              </Field>
              <Field name="duration" label={t.duration} errors={state.fieldErrors.durationSeconds}>
                <Input
                  {...fieldProps("duration", "durationSeconds")}
                  placeholder={detailPlaceholder(
                    i18n,
                    current ? formatSeconds(current.durationSeconds) : undefined,
                    "4:05",
                  )}
                />
              </Field>
            </div>
            <div className="grid gap-4 @md:grid-cols-2">
              <Field name="otherKeys" label={t.otherKeys} errors={state.fieldErrors.otherKeys}>
                <Input
                  {...fieldProps("otherKeys")}
                  placeholder={detailPlaceholder(
                    i18n,
                    current &&
                      (current.otherKeys.length > 0
                        ? current.otherKeys.map(chartKey).join(", ")
                        : null),
                    "E, A",
                  )}
                />
              </Field>
              <Field
                name="notation"
                label={t.noteNames}
                hint={t.noteNamesHint}
                errors={state.fieldErrors.notation}
              >
                <NativeSelect
                  {...fieldProps("notation")}
                  value={notationValue}
                  onChange={(event) => setNotation(event.target.value)}
                  className="w-full"
                >
                  <option value="auto">{t.noteNamesAuto}</option>
                  <option value="english">{m.components.noteNames.english}</option>
                  <option value="german">{m.components.noteNames.german}</option>
                </NativeSelect>
              </Field>
            </div>
          </section>

          {/* Closed when the song has no rights data yet, e.g. a new song: the nightly research can fill it. */}
          {/* A heading with a button in it, not `<summary>`: screen readers find the heading. The closed fields are still sent. */}
          <section
            id="rights"
            aria-labelledby="rights-heading"
            className="scroll-mt-32 rounded-card border"
          >
            <h2 id="rights-heading" className="font-heading text-fs-5 font-bold tracking-tight">
              <button
                type="button"
                aria-expanded={rightsOpen}
                aria-controls="rights-fields"
                onClick={() => setRightsOpen((open) => !open)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-card px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-focus/50"
              >
                {t.rights}
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    "size-4 text-muted transition-transform",
                    rightsOpen && "rotate-180",
                  )}
                />
              </button>
            </h2>
            <div
              id="rights-fields"
              hidden={!rightsOpen}
              className="flex flex-col gap-4 border-t px-4 pt-3 pb-4"
            >
              <p className="text-sm text-muted">{t.rightsDescription}</p>
              {sharedRights && <SharedRightsBox rights={sharedRights} form={formRef} />}
              <Field
                name="rightsStatus"
                label={t.rightsStatus}
                hint={t.rightsStatusHint}
                errors={state.fieldErrors.rightsStatus}
              >
                <NativeSelect
                  {...fieldProps("rightsStatus")}
                  defaultValue={song?.rightsStatus ?? DEFAULT_SONG_RIGHTS_STATUS}
                  className="w-full"
                >
                  {SONG_RIGHTS_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {m.songs.rightsStatuses[status]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                name="rightsNote"
                label={t.rightsNote}
                hint={t.rightsNoteHint}
                errors={state.fieldErrors.rightsNote}
              >
                <Textarea
                  {...fieldProps("rightsNote")}
                  defaultValue={song?.rightsNote ?? undefined}
                  maxLength={SONG_RIGHTS_NOTE_MAX_LENGTH}
                  rows={2}
                />
              </Field>
              <Field
                name="originalTitle"
                label={t.originalTitle}
                hint={t.originalTitleHint}
                errors={state.fieldErrors.originalTitle}
              >
                <Input
                  {...fieldProps("originalTitle")}
                  defaultValue={song?.originalTitle ?? undefined}
                  maxLength={SONG_ORIGINAL_TITLE_MAX_LENGTH}
                />
              </Field>
              <Field
                name="copyright"
                label={t.copyright}
                hint={t.copyrightHint}
                errors={state.fieldErrors.copyright}
              >
                <Textarea
                  {...fieldProps("copyright")}
                  defaultValue={song?.copyright ?? undefined}
                  maxLength={SONG_COPYRIGHT_MAX_LENGTH}
                  rows={2}
                />
              </Field>
            </div>
          </section>

          {/* Not part of the chart. Without the themes, the form has no theme field and keeps the theme. */}
          {song?.themes && song.themes.length > 0 && (
            <section id="projection" className="flex scroll-mt-32 flex-col gap-4">
              <SectionHeading title={t.projection} />
              <div className="grid gap-4 @md:grid-cols-2">
                <Field name="themeId" label={t.theme} errors={state.fieldErrors.themeId}>
                  <NativeSelect
                    {...fieldProps("themeId")}
                    // A deleted theme shows as none.
                    defaultValue={
                      song.themes.some((theme) => theme.id === song.arrangement.themeId)
                        ? (song.arrangement.themeId ?? "")
                        : ""
                    }
                    className="w-full"
                  >
                    <option value="">{t.themeNone}</option>
                    {song.themes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </section>
          )}
        </PreviewLayout>
      </DialogBodyIf>

      {embedded ? (
        state.status === "error" &&
        state.message && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )
      ) : inDialog ? (
        <DialogFooter>
          {state.status === "error" && state.message && (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {cancelButton}
            {submitButton}
          </div>
        </DialogFooter>
      ) : (
        // The one save button of the page, as on the edit page (`PageSaveBar`).
        <SaveBar error={state.status === "error" && state.message} className="-mx-4 -mb-8 sm:-mx-6">
          {submitButton}
          {cancelButton}
        </SaveBar>
      )}
    </form>
  );

  return inDialog || !card ? form : <PageCard>{form}</PageCard>;
}

/** In a dialog, the fields scroll between the fixed header and the fixed buttons. On a page, no wrapper. */
function DialogBodyIf({ inDialog, children }: { inDialog: boolean; children: React.ReactNode }) {
  return inDialog ? <DialogBody className="@container gap-8">{children}</DialogBody> : children;
}

/**
 * The placeholder of a detail field. When editing (`chartValue` is not
 * undefined) it names the value the chart already has; when adding a
 * song it gives an example. The prefix keeps it from looking like a value.
 */
function detailPlaceholder(
  { m, format }: I18n,
  chartValue: string | null | undefined,
  example: string,
): string {
  if (chartValue === undefined) return format(m.songs.form.placeholderExample, { value: example });
  return chartValue
    ? format(m.songs.form.placeholderFromChart, { value: chartValue })
    : m.songs.form.placeholderNotInChart;
}

const RIGHTS_FIELDS = ["rightsStatus", "rightsNote", "originalTitle", "copyright"] as const;

function hasRightsData(song: SongFormValues | undefined): boolean {
  if (!song) return false;
  return (
    song.rightsStatus !== DEFAULT_SONG_RIGHTS_STATUS ||
    [song.rightsNote, song.originalTitle, song.copyright].some(
      (value) => (value ?? "").trim() !== "",
    )
  );
}

/** For example "4:05". Null gives "". */
function formatSeconds(seconds: number | null): string {
  return seconds === null ? "" : formatMinutesSeconds(seconds);
}

/** The text fields that "Fill from the catalog" fills when they are empty. */
const SHARED_FIELDS = ["authors", "originalTitle", "translator", "songbook", "copyright"] as const;

/**
 * Churchy: the facts of the shared song-rights catalog (PLAN §11.2) for this song. "Fill from
 * the catalog" puts them into the empty fields; the church's own licence status and note stay.
 */
function SharedRightsBox({
  rights,
  form,
}: {
  rights: SharedSongRightsDTO;
  form: React.RefObject<HTMLFormElement | null>;
}) {
  const { m } = useI18n();
  const t = m.songs.form.sharedRights;
  const facts = SHARED_FIELDS.flatMap((field) => {
    const value = rights[field];
    return value ? [{ field, value }] : [];
  });
  if (facts.length === 0) return null;

  function fill() {
    const elements = form.current?.elements;
    if (!elements) return;
    for (const { field, value } of facts) {
      const element = elements.namedItem(field);
      if (
        (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
        element.value.trim() === ""
      ) {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-card border bg-surface-sunken p-3"
      data-testid="shared-rights"
    >
      <p className="text-sm font-medium">{t.title}</p>
      <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {facts.map(({ field, value }) => (
          <div key={field} className="contents">
            <dt className="text-muted">{m.songs.form[field]}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted">{t.description}</p>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={fill}>
          {t.fill}
        </Button>
      </div>
    </div>
  );
}

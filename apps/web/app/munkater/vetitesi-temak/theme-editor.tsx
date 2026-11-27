"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import { CopyIcon, FilmIcon, ImageIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";

import { ColorField } from "@/components/music/color-field";
import { Field, SectionHeading } from "@/components/music/form-field";
import {
  ConfirmDialog,
  ConfirmDialogTrigger,
  FormFooter,
  submitWithoutReset,
} from "@/components/music/form-parts";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { ImageDecodeError, resizeImage } from "@/lib/music/image-resize";
import {
  fontFamily,
  PROJECTION_FONT_IDS,
  PROJECTION_FONTS,
  type ProjectionFontId,
} from "@/lib/music/projection/fonts";
import type { ProjectionSlide } from "@/lib/music/projection/slides";
import {
  BACKGROUND_DIM_MAX,
  MARGIN_MAX,
  NAME_MAX_LENGTH,
  REFERENCE_SIZE_MAX,
  REFERENCE_SIZE_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TRANSITION_MS_MAX,
  type ProjectionLook,
  type ProjectionThemeDTO,
} from "@/lib/music/projection/themes";
import {
  PROJECTION_VIDEO_HEADER_BYTES,
  PROJECTION_VIDEO_MAX_BYTES,
  projectionVideoTypeOf,
} from "@/lib/music/projection/videos";
import { toastError, toastSuccess } from "@/lib/music/toast";
import type { ThemeInput } from "@/server/music/models/projection-themes";
import { SlideView } from "@/app/munkater/vetites/slide-view";
import {
  deleteThemeAction,
  duplicateThemeAction,
  removeBackgroundAction,
  setBackgroundAction,
  setDefaultThemeAction,
  setVideoAction,
  startVideoUploadAction,
  themeUsesAction,
  saveThemeAction,
  type ThemeFormState,
} from "./actions-client";
import { videoPoster } from "./video-poster";

const initialState: ThemeFormState = { status: "idle", message: null, fieldErrors: {} };

/** The longest side of a background that the browser sends: a 4K screen. */
const UPLOAD_MAX_SIDE_PX = 3840;
/** A Vercel Function accepts at most 4.5 MB in a request, with the other fields. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const UPLOAD_QUALITIES = [0.85, 0.7, 0.55];

const RATIOS = { "16:9": 16 / 9, "16:10": 16 / 10, "4:3": 4 / 3 };
type RatioName = keyof typeof RATIOS;
type SampleSlide = "title" | "lyrics" | "scripture" | "announcements" | "text";

type Fields = Required<ThemeInput>;

/** The fields of the editor for a look (see `themeInputSchema`). */
export function lookToFields(look: ProjectionLook): Omit<Fields, "name"> {
  return {
    backgroundColor: look.background.color,
    backgroundDim: look.background.dim,
    font: look.font,
    textColor: look.textColor,
    accentColor: look.accentColor,
    textSize: look.textSize,
    referenceSize: look.referenceSize,
    textAlign: look.textAlign,
    verticalAlign: look.verticalAlign,
    textShadow: look.textShadow,
    margin: look.margin,
    transition: look.transition.kind,
    transitionMs: look.transition.ms,
    rollTransitionMs: look.transition.rollMs,
  };
}

function fieldsToLook(
  fields: Fields,
  { image, video }: Pick<ProjectionLook["background"], "image" | "video">,
): ProjectionLook {
  return {
    background: { color: fields.backgroundColor, image, video, dim: fields.backgroundDim },
    font: fields.font,
    textColor: fields.textColor,
    accentColor: fields.accentColor,
    textSize: fields.textSize,
    referenceSize: fields.referenceSize,
    textAlign: fields.textAlign,
    verticalAlign: fields.verticalAlign,
    textShadow: fields.textShadow,
    margin: fields.margin,
    transition: {
      kind: fields.transition,
      ms: fields.transitionMs,
      rollMs: fields.rollTransitionMs,
    },
  };
}

/**
 * The editor of one theme, with a preview of a title, a lyrics and a
 * scripture slide. The fields save with "Save"; the background image saves at
 * once. A superadmin can make the theme the default.
 */
export function ThemeEditor({
  theme,
  canSetDefault,
  onCreated,
}: {
  theme: ProjectionThemeDTO;
  canSetDefault: boolean;
  /** A copy of the theme was created: the page selects it. */
  onCreated: (id: string) => void;
}) {
  const i18n = useI18n();
  const { m, format } = i18n;
  const t = m.projectionThemes.editor;
  const id = useId();
  const [fields, setFields] = useState<Fields>({ name: theme.name, ...lookToFields(theme.look) });
  const [state, formAction, pending] = useActionState(saveThemeAction, initialState);
  const [busy, startBusy] = useTransition();
  const look = fieldsToLook(fields, theme.look.background);

  function set<Key extends keyof Fields>(key: Key, value: Fields[Key]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function duplicate() {
    startBusy(async () => {
      const result = await duplicateThemeAction(theme.id);
      if (result.status === "success") {
        toastSuccess(m.projectionThemes.actions.duplicated);
        onCreated(result.id);
      } else toastError(result.message || m.projectionThemes.actions.duplicateFailed);
    });
  }

  function makeDefault() {
    startBusy(async () => {
      const result = await setDefaultThemeAction(theme.id);
      if (result.status === "success") toastSuccess(m.projectionThemes.actions.defaultSet);
      else toastError(result.message);
    });
  }

  return (
    <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        onSubmit={submitWithoutReset(formAction)}
        className="flex min-w-0 flex-col gap-6"
        aria-label={theme.name}
      >
        <input type="hidden" name="id" value={theme.id} />
        <input type="hidden" name="theme" value={JSON.stringify(fields)} />

        <Field name={`${id}-name`} label={t.name} errors={state.fieldErrors.name}>
          <Input
            id={`${id}-name`}
            required
            maxLength={NAME_MAX_LENGTH}
            value={fields.name}
            onChange={(event) => set("name", event.target.value)}
            aria-invalid={(state.fieldErrors.name?.length ?? 0) > 0 || undefined}
            aria-describedby={`${id}-name-description`}
          />
        </Field>

        <section className="flex flex-col gap-4">
          <SectionHeading title={t.backgroundSection} />
          <ColorField
            id={`${id}-background`}
            label={t.backgroundColor}
            value={fields.backgroundColor}
            onChange={(value) => set("backgroundColor", value)}
          />
          <BackgroundMedia theme={theme} />
          {theme.look.background.image && (
            <RangeField
              id={`${id}-dim`}
              label={t.dim}
              min={0}
              max={BACKGROUND_DIM_MAX}
              step={5}
              value={fields.backgroundDim}
              display={format(t.percent, { value: fields.backgroundDim })}
              onChange={(value) => set("backgroundDim", value)}
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeading title={t.textSection} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-font`}>{t.font}</Label>
            <NativeSelect
              id={`${id}-font`}
              value={fields.font}
              onChange={(event) => set("font", event.target.value as ProjectionFontId)}
              style={{ fontFamily: fontFamily(fields.font) }}
            >
              {PROJECTION_FONT_IDS.map((font) => (
                <option key={font} value={font} style={{ fontFamily: fontFamily(font) }}>
                  {PROJECTION_FONTS[font].label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <ColorField
            id={`${id}-text-color`}
            label={t.textColor}
            value={fields.textColor}
            onChange={(value) => set("textColor", value)}
          />
          <AccentField
            id={`${id}-accent`}
            value={fields.accentColor}
            fallback={fields.textColor}
            onChange={(value) => set("accentColor", value)}
          />
          <RangeField
            id={`${id}-size`}
            label={t.textSize}
            hint={t.textSizeHint}
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            step={5}
            value={fields.textSize}
            display={format(t.percent, { value: fields.textSize })}
            onChange={(value) => set("textSize", value)}
          />
          <RangeField
            id={`${id}-reference-size`}
            label={t.referenceSize}
            hint={t.referenceSizeHint}
            min={REFERENCE_SIZE_MIN}
            max={REFERENCE_SIZE_MAX}
            step={5}
            value={fields.referenceSize}
            display={format(t.percent, { value: fields.referenceSize })}
            onChange={(value) => set("referenceSize", value)}
          />
          <ChoiceField
            label={t.textAlign}
            value={fields.textAlign}
            options={[
              ["left", t.alignLeft],
              ["center", t.alignCenter],
              ["right", t.alignRight],
            ]}
            onChange={(value) => set("textAlign", value)}
          />
          <ChoiceField
            label={t.verticalAlign}
            value={fields.verticalAlign}
            options={[
              ["top", t.alignTop],
              ["center", t.alignMiddle],
              ["bottom", t.alignBottom],
            ]}
            onChange={(value) => set("verticalAlign", value)}
          />
          <ChoiceField
            label={t.shadow}
            value={fields.textShadow}
            options={[
              ["none", t.shadowNone],
              ["light", t.shadowLight],
              ["strong", t.shadowStrong],
            ]}
            onChange={(value) => set("textShadow", value)}
          />
          <RangeField
            id={`${id}-margin`}
            label={t.margin}
            min={0}
            max={MARGIN_MAX}
            step={1}
            value={fields.margin}
            display={format(t.percent, { value: fields.margin })}
            onChange={(value) => set("margin", value)}
          />
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeading title={t.transitionSection} />
          <ChoiceField
            label={t.transition}
            value={fields.transition}
            options={[
              ["cut", t.transitionCut],
              ["fade", t.transitionFade],
            ]}
            onChange={(value) => set("transition", value)}
          />
          {fields.transition === "fade" && (
            <RangeField
              id={`${id}-duration`}
              label={t.duration}
              min={0}
              max={TRANSITION_MS_MAX}
              step={50}
              value={fields.transitionMs}
              display={format(t.milliseconds, { value: fields.transitionMs })}
              onChange={(value) => set("transitionMs", value)}
            />
          )}
          <RangeField
            id={`${id}-roll-duration`}
            label={t.rollDuration}
            hint={t.rollDurationHint}
            min={0}
            max={TRANSITION_MS_MAX}
            step={50}
            value={fields.rollTransitionMs}
            display={format(t.milliseconds, { value: fields.rollTransitionMs })}
            onChange={(value) => set("rollTransitionMs", value)}
          />
        </section>

        <FormFooter state={state}>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t.saving : t.save}
            </Button>
            <Button type="button" variant="outline" onClick={duplicate} disabled={busy}>
              <CopyIcon />
              {busy ? t.duplicating : t.duplicate}
            </Button>
            {canSetDefault && !theme.isDefault && (
              <Button type="button" variant="outline" onClick={makeDefault} disabled={busy}>
                <StarIcon />
                {t.makeDefault}
              </Button>
            )}
            <DeleteTheme theme={theme} />
          </div>
        </FormFooter>
        <p className="text-sm text-muted">
          {theme.isDefault ? t.deleteDefaultNote : t.defaultNote}
        </p>
      </form>

      <Preview look={look} />
    </div>
  );
}

/** The preview of the look, with a sample slide and a screen shape to choose. */
function Preview({ look }: { look: ProjectionLook }) {
  const { m } = useI18n();
  const t = m.projectionThemes.editor;
  const id = useId();
  const [ratio, setRatio] = useState<RatioName>("16:9");
  const [sample, setSample] = useState<SampleSlide>("lyrics");
  const slides: Record<SampleSlide, ProjectionSlide> = {
    title: { kind: "title", title: t.sampleTitle, copyright: t.sampleCopyright },
    lyrics: { kind: "lyrics", paragraphs: [t.sampleLyrics.split("\n")] },
    scripture: {
      kind: "scripture",
      verses: [{ label: "16", text: t.sampleScripture }],
      reference: t.sampleReference,
    },
    announcements: {
      kind: "announcements",
      heading: t.sampleAnnouncementsHeading,
      range: t.sampleAnnouncementsRange,
      entries: [
        {
          when: t.sampleAnnouncementWhen,
          title: t.sampleAnnouncementTitle,
          details: [],
          accent: false,
        },
        {
          when: t.sampleHighlightWhen,
          title: t.sampleHighlightTitle,
          details: [t.sampleHighlightPlace],
          accent: true,
        },
      ],
    },
    text: {
      kind: "text",
      paragraphs: [[t.sampleTextDescription]],
      highlight: [[t.sampleTextHighlight]],
    },
  };

  return (
    <section
      aria-label={t.preview}
      className="flex min-w-0 flex-col gap-3 @3xl:sticky @3xl:top-24 @3xl:self-start"
    >
      <SectionHeading title={t.preview} />
      <div className="flex flex-wrap items-end gap-3">
        <ChoiceField
          label={t.previewSlide}
          value={sample}
          options={[
            ["title", t.previewTitle],
            ["lyrics", t.previewLyrics],
            ["scripture", t.previewScripture],
            ["announcements", t.previewAnnouncements],
            ["text", t.previewText],
          ]}
          onChange={setSample}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-ratio`}>{t.previewShape}</Label>
          <NativeSelect
            id={`${id}-ratio`}
            value={ratio}
            onChange={(event) => setRatio(event.target.value as RatioName)}
            className="w-auto"
          >
            {Object.keys(RATIOS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border" style={{ aspectRatio: RATIOS[ratio] }}>
        <SlideView slide={slides[sample]} look={look} playVideo />
      </div>
    </section>
  );
}

/**
 * The background image or video: choose, replace or remove. Saves at once. A
 * video goes directly to Storage, with a still frame of it as its image.
 */
function BackgroundMedia({ theme }: { theme: ProjectionThemeDTO }) {
  const { m, format } = useI18n();
  const t = m.projectionThemes.editor;
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { image, video } = theme.look.background;
  const hintId = useId();
  const mb = PROJECTION_VIDEO_MAX_BYTES / (1024 * 1024);

  function upload(file: File) {
    setError(null);
    startUpload(async () => {
      let blob: Blob;
      try {
        blob = (
          await resizeImage(file, {
            maxSide: UPLOAD_MAX_SIDE_PX,
            qualities: UPLOAD_QUALITIES,
            maxBytes: UPLOAD_MAX_BYTES,
          })
        ).blob;
      } catch (cause) {
        setError(cause instanceof ImageDecodeError ? t.imageDecodeFailed : t.imageTooLarge);
        return;
      }
      if (blob.size > UPLOAD_MAX_BYTES) {
        setError(t.imageTooLarge);
        return;
      }
      const formData = new FormData();
      formData.set("id", theme.id);
      formData.set("image", blob, "background.jpg");
      try {
        const result = await setBackgroundAction(formData);
        if (result.status === "error") setError(result.message);
      } catch {
        // The request failed, e.g. without a connection.
        setError(t.imageFailed);
      }
    });
  }

  function uploadVideo(file: File) {
    setError(null);
    setUploadingVideo(true);
    startUpload(async () => {
      try {
        const problem = await putVideo(file);
        if (problem) setError(problem);
      } catch {
        // The request failed, e.g. without a connection.
        setError(t.videoFailed);
      } finally {
        setUploadingVideo(false);
      }
    });
  }

  /** Checks the video, makes its poster, puts it to Storage and sets it. The problem, or null. */
  async function putVideo(file: File): Promise<string | null> {
    // Storage refuses a larger file too. This says why at once.
    if (file.size > PROJECTION_VIDEO_MAX_BYTES) return format(t.videoTooLarge, { mb });
    // The content decides, not the name: e.g. a MOV file of an iPhone is often an MP4 file.
    const type = projectionVideoTypeOf(
      new Uint8Array(await file.slice(0, PROJECTION_VIDEO_HEADER_BYTES).arrayBuffer()),
    );
    if (!type) return t.videoType;

    let poster: Blob;
    try {
      poster = await videoPoster(file, {
        maxSide: UPLOAD_MAX_SIDE_PX,
        qualities: UPLOAD_QUALITIES,
        maxBytes: UPLOAD_MAX_BYTES,
      });
    } catch {
      return t.videoDecodeFailed;
    }
    if (poster.size > UPLOAD_MAX_BYTES) return t.videoDecodeFailed;

    const upload = await startVideoUploadAction(theme.id, type);
    if (upload.status === "error") return upload.message;
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "content-type": type, "cache-control": "max-age=31536000", "x-upsert": "false" },
      body: file,
    });
    if (!response.ok) {
      // Storage can also give the HTTP status in the body, e.g. `{ "statusCode": "413" }`.
      const body: unknown = await response.json().catch(() => null);
      const status =
        body && typeof body === "object" && "statusCode" in body ? String(body.statusCode) : "";
      if (response.status === 413 || status === "413") return format(t.videoTooLarge, { mb });
      if (response.status === 415 || status === "415") return t.videoType;
      return t.videoFailed;
    }

    const formData = new FormData();
    formData.set("id", theme.id);
    formData.set("path", upload.path);
    formData.set("poster", poster, "poster.jpg");
    const result = await setVideoAction(formData);
    return result.status === "error" ? result.message : null;
  }

  function remove() {
    setError(null);
    startUpload(async () => {
      try {
        const result = await removeBackgroundAction(theme.id);
        if (result.status === "error") setError(result.message);
      } catch {
        setError(t.imageFailed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t.backgroundImage}</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex aspect-video w-32 items-center justify-center overflow-hidden rounded-md border bg-surface-sunken">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private file: the image optimizer cannot read it.
            <img src={image} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs text-muted">
              <ImageIcon aria-hidden className="size-4" />
              {t.noImage}
            </span>
          )}
          {video && (
            <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
              <FilmIcon aria-hidden className="size-3" />
              {t.videoBadge}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) uploadVideo(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => imageInput.current?.click()}
            aria-describedby={hintId}
          >
            {uploading && !uploadingVideo
              ? t.uploading
              : image && !video
                ? t.replaceImage
                : t.chooseImage}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => videoInput.current?.click()}
            aria-describedby={hintId}
          >
            <FilmIcon />
            {uploadingVideo ? t.uploadingVideo : video ? t.replaceVideo : t.chooseVideo}
          </Button>
          {image && (
            <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={remove}>
              <XIcon />
              {video ? t.removeVideo : t.removeImage}
            </Button>
          )}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <div id={hintId} className="flex flex-col gap-1 text-sm text-muted">
          <p>{t.imageHint}</p>
          <p>{format(t.videoHint, { mb })}</p>
        </div>
      )}
    </div>
  );
}

/** "Delete" with a dialog that tells how many events and items use the theme. Off for the default theme. */
function DeleteTheme({ theme }: { theme: ProjectionThemeDTO }) {
  const { m, format } = useI18n();
  const t = m.projectionThemes.editor;
  const [open, setOpen] = useState(false);
  const [uses, setUses] = useState<{ events: number; items: number; arrangements: number } | null>(
    null,
  );
  const [state, formAction, pending] = useActionState(
    async (previous: ThemeFormState, formData: FormData) => {
      const result = await deleteThemeAction(previous, formData);
      if (result.status === "success") {
        setOpen(false);
        toastSuccess(result.message ?? m.projectionThemes.actions.deleted);
      }
      return result;
    },
    initialState,
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setUses(null);
          void themeUsesAction(theme.id).then(setUses);
        }
      }}
      trigger={
        <ConfirmDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              disabled={theme.isDefault}
            />
          }
        >
          <Trash2Icon />
          {t.delete}
        </ConfirmDialogTrigger>
      }
      title={format(t.deleteTitle, { name: theme.name })}
      description={
        uses === null
          ? null
          : uses.events + uses.items + uses.arrangements === 0
            ? t.deleteUnused
            : format(t.deleteDescription, {
                events: uses.events,
                items: uses.items,
                arrangements: uses.arrangements,
              })
      }
      id={theme.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.delete}
      pendingLabel={t.deleting}
    />
  );
}

/** The accent color of the highlighted announcements, or none: then they are bold, with a marker. */
function AccentField({
  id,
  value,
  fallback,
  onChange,
}: {
  id: string;
  value: string | null;
  /** The color to start with: the color of the text. */
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  const { m } = useI18n();
  const t = m.projectionThemes.editor;
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? fallback : null)}
          aria-describedby={`${id}-hint`}
        />
        {t.accentColor}
      </label>
      {value !== null && (
        <ColorField id={id} label={t.accentColorValue} value={value} onChange={onChange} />
      )}
      <p id={`${id}-hint`} className="text-sm text-muted">
        {t.accentHint}
      </p>
    </div>
  );
}

export function RangeField({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** The value as text, e.g. "40%". */
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm text-muted tabular-nums">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A row of buttons, one of them pressed. */
export function ChoiceField<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: [Value, string][];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map(([option, optionLabel]) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={option === value ? "default" : "outline"}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {optionLabel}
          </Button>
        ))}
      </div>
    </div>
  );
}

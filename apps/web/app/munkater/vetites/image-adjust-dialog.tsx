"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { RotateCcwIcon, RotateCwIcon, UndoIcon, XIcon } from "lucide-react";

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
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import {
  clampOffset,
  DEFAULT_IMAGE_ADJUST,
  IMAGE_NAME_MAX_LENGTH,
  IMAGE_OFFSET_MAX,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
  turnImage,
  type EventImageDTO,
  type ImageAdjust,
  type ImageBackground,
  type ImageFit,
} from "@/lib/music/projection/images";
import type { ProjectionSlide } from "@/lib/music/projection/slides";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import { cn } from "@/lib/music/utils";
import { ColorField } from "@/components/music/color-field";
import { ChoiceField, RangeField } from "@/app/munkater/vetitesi-temak/theme-editor";
import { updateEventImageAction } from "./image-actions-client";
import { projectionFontVariables } from "./projection-fonts";
import { SlideView } from "./slide-view";

// The editor of an image of an event's gallery: its name, and how its slide
// shows it (see `ImageAdjust`). The preview shows the slide in the look of
// the event; a drag on it moves the image. The page of the event and the
// controller of the projection use it. It saves with "Save".

const RATIOS = { "16:9": 16 / 9, "16:10": 16 / 10, "4:3": 4 / 3 };
type RatioName = keyof typeof RATIOS;

export function ImageAdjustDialog({
  image,
  look,
  aspectRatio,
  open,
  onOpenChange,
  onSaved,
  qr,
}: {
  image: EventImageDTO;
  /** The look of the event, for the background around the image. */
  look: ProjectionLook;
  /** The QR code next to the image: a page of the attachment of an announcement. */
  qr?: ImageQr;
  /** The shape of the screens, e.g. on the controller. Null: the user chooses a shape for the preview. */
  aspectRatio: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a save, with the saved values. */
  onSaved?: (image: EventImageDTO) => void;
}) {
  const { m } = useI18n();
  const t = m.project.images;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-3xl")}>
          <DialogHeader className="flex-row items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                {t.adjustTitle}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {t.adjustDescription}
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
          {/* A new editor for each opening: it starts with the saved values. */}
          {open && (
            <ImageAdjustEditor
              image={image}
              look={look}
              qr={qr}
              aspectRatio={aspectRatio}
              onDone={(saved) => {
                onSaved?.(saved);
                onOpenChange(false);
              }}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ImageQr = Extract<ProjectionSlide, { kind: "image" }>["qr"];

function ImageAdjustEditor({
  image,
  look,
  qr,
  aspectRatio,
  onDone,
}: {
  image: EventImageDTO;
  look: ProjectionLook;
  qr?: ImageQr;
  aspectRatio: number | null;
  onDone: (image: EventImageDTO) => void;
}) {
  const { m, format } = useI18n();
  const t = m.project.images;
  const id = useId();
  const [name, setName] = useState(image.name);
  const [adjust, setAdjust] = useState(image.adjust);
  const [ratioName, setRatioName] = useState<RatioName>("16:9");
  const ratio = aspectRatio ?? RATIOS[ratioName];
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function set<Key extends keyof ImageAdjust>(key: Key, value: ImageAdjust[Key]) {
    setAdjust((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setError(null);
    startSave(async () => {
      const trimmed = name.trim();
      try {
        const result = await updateEventImageAction(image.id, { name: trimmed, adjust });
        if (result.status === "error") setError(result.message);
        else onDone({ ...image, name: trimmed, adjust });
      } catch {
        // The request failed, e.g. without a connection.
        setError(t.saveFailed);
      }
    });
  }

  const percent = (value: number) => format(t.percent, { value });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className={DIALOG_FORM_CLASS}
    >
      <DialogBody className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <DragPreview
            image={image}
            adjust={adjust}
            look={look}
            qr={qr}
            aspectRatio={ratio}
            onMove={(x, y) => setAdjust((current) => ({ ...current, x, y }))}
          />
          <p className="text-sm text-muted">{t.dragHint}</p>
          {aspectRatio === null && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`${id}-ratio`}>{t.previewShape}</Label>
              <NativeSelect
                id={`${id}-ratio`}
                value={ratioName}
                onChange={(event) => setRatioName(event.target.value as RatioName)}
                className="w-auto"
              >
                {Object.keys(RATIOS).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-name`}>{t.name}</Label>
            <Input
              id={`${id}-name`}
              value={name}
              required
              maxLength={IMAGE_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <ChoiceField<ImageFit>
            label={t.fit}
            value={adjust.fit}
            options={[
              ["contain", t.fitContain],
              ["cover", t.fitCover],
            ]}
            onChange={(value) => set("fit", value)}
          />
          <RangeField
            id={`${id}-scale`}
            label={t.scale}
            min={IMAGE_SCALE_MIN}
            max={IMAGE_SCALE_MAX}
            step={5}
            value={adjust.scale}
            display={percent(adjust.scale)}
            onChange={(value) => set("scale", value)}
          />
          <RangeField
            id={`${id}-x`}
            label={t.horizontal}
            min={-IMAGE_OFFSET_MAX}
            max={IMAGE_OFFSET_MAX}
            step={1}
            value={adjust.x}
            display={percent(adjust.x)}
            onChange={(value) => set("x", value)}
          />
          <RangeField
            id={`${id}-y`}
            label={t.vertical}
            min={-IMAGE_OFFSET_MAX}
            max={IMAGE_OFFSET_MAX}
            step={1}
            value={adjust.y}
            display={percent(adjust.y)}
            onChange={(value) => set("y", value)}
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t.rotation}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("rotation", turnImage(adjust.rotation, -1))}
              >
                <RotateCcwIcon />
                {t.rotateLeft}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("rotation", turnImage(adjust.rotation, 1))}
              >
                <RotateCwIcon />
                {t.rotateRight}
              </Button>
              <span className="text-sm text-muted tabular-nums">
                {format(t.degrees, { value: adjust.rotation })}
              </span>
            </div>
          </div>
          <ChoiceField<ImageBackground>
            label={t.background}
            value={adjust.background}
            options={[
              ["color", t.backgroundColor],
              ["theme", t.backgroundTheme],
              ["blur", t.backgroundBlur],
            ]}
            onChange={(value) => set("background", value)}
          />
          {adjust.background === "color" && (
            <ColorField
              id={`${id}-background`}
              label={t.backgroundColor}
              value={adjust.backgroundColor}
              onChange={(value) => set("backgroundColor", value)}
            />
          )}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdjust(DEFAULT_IMAGE_ADJUST)}
            >
              <UndoIcon />
              {t.reset}
            </Button>
          </div>
        </div>
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
          <Button type="submit" disabled={saving || name.trim() === ""}>
            {saving ? m.common.actions.saving : t.save}
          </Button>
        </DialogActions>
      </DialogFooter>
    </form>
  );
}

/** The slide of the image. A drag on it moves the center of the image. */
function DragPreview({
  image,
  adjust,
  look,
  qr,
  aspectRatio,
  onMove,
}: {
  image: EventImageDTO;
  adjust: ImageAdjust;
  look: ProjectionLook;
  qr?: ImageQr;
  aspectRatio: number;
  onMove: (x: number, y: number) => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div
      className={cn(
        "relative w-full cursor-move touch-none overflow-hidden rounded-md border select-none",
        projectionFontVariables,
      )}
      style={{ aspectRatio }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: adjust.x,
          y: adjust.y,
        };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        const { width, height } = event.currentTarget.getBoundingClientRect();
        if (width <= 0 || height <= 0) return;
        onMove(
          clampOffset(start.x + ((event.clientX - start.startX) / width) * 100),
          clampOffset(start.y + ((event.clientY - start.startY) / height) * 100),
        );
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <SlideView
        slide={{
          kind: "image",
          url: image.url,
          width: image.width,
          height: image.height,
          adjust,
          ...(qr && { qr }),
        }}
        look={look}
      />
    </div>
  );
}

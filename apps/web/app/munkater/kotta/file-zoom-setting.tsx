"use client";

import { MinusIcon, PlusIcon, ShrinkIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import {
  FILE_ZOOM_MAX,
  FIT_VIEW,
  isFitView,
  pinchView,
  type FileView,
} from "@/lib/music/file-view";

/** The zoom of one step of the buttons. */
const ZOOM_STEP = 1.25;
const CENTER = { x: 0.5, y: 0.5 };

/**
 * The user's zoom of the PDF file or the image on the sheet, in the settings.
 * The buttons zoom around the center of the page; a pinch also moves it.
 */
export function FileZoomSetting({
  view,
  error,
  onChange,
}: {
  view: FileView;
  error: string | null;
  onChange: (view: FileView) => void;
}) {
  const { m, number } = useI18n();
  const t = m.sheet.zoom;
  const fit = isFitView(view);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted">{t.title}</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.zoomOut}
          disabled={fit}
          onClick={() => onChange(pinchView(view, CENTER, CENTER, 1 / ZOOM_STEP))}
        >
          <MinusIcon />
        </Button>
        <output aria-live="polite" className="flex-1 text-center text-sm tabular-nums">
          {number(view.zoom, { style: "percent", maximumFractionDigits: 0 })}
        </output>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.zoomIn}
          disabled={view.zoom >= FILE_ZOOM_MAX}
          onClick={() => onChange(pinchView(view, CENTER, CENTER, ZOOM_STEP))}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t.fit}
          title={t.fit}
          disabled={fit}
          onClick={() => onChange(FIT_VIEW)}
        >
          <ShrinkIcon />
        </Button>
      </div>
      <p className="text-xs text-muted">{t.hint}</p>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

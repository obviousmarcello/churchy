"use client";

import { useState } from "react";
import { PresentationIcon } from "lucide-react";
import { encode } from "uqr";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import {
  PPTX_MIME_TYPE,
  projectionPptx,
  qrImageKey,
  slideQr,
  type PptxImage,
} from "@/lib/music/projection/pptx";
import type { ProjectionItem } from "@/lib/music/projection/slides";
import { toastInfo } from "@/lib/music/toast";

/**
 * Downloads the slides of the setlist as a PowerPoint file, for the screen
 * shape of the controller, in the looks of the projection themes. The browser
 * makes the file: it also works offline, when the browser has the background
 * images and the images of the gallery. A background that does not load
 * leaves its color only, and an image that does not load leaves its slide empty.
 */
export function DownloadSlidesButton({
  title,
  items,
  aspectRatio,
}: {
  title: string;
  items: ProjectionItem[];
  aspectRatio: number;
}) {
  const { m, locale } = useI18n();
  const t = m.project.controller;
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    let images: Map<string, PptxImage>;
    try {
      images = await loadImages(items);
    } finally {
      setBusy(false);
    }
    const file = projectionPptx(items, { title, aspectRatio, lang: locale, images });
    const url = URL.createObjectURL(new Blob([file], { type: PPTX_MIME_TYPE }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName(title) || t.slidesFileName}.pptx`;
    link.click();
    // Some browsers, e.g. Safari, start the download after the click: the file must stay until then.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (items.some((item) => item.look.font !== "inter")) toastInfo(m.project.themes.pptxFontNote);
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={items.length === 0 || busy}
      onClick={() => void download()}
      aria-label={t.downloadSlides}
      title={t.downloadSlides}
    >
      <PresentationIcon />
      <span className="sr-only sm:not-sr-only">{t.downloadSlidesShort}</span>
    </Button>
  );
}

/** The title without the characters that file names cannot have. */
function fileName(title: string) {
  return (
    title
      // eslint-disable-next-line no-control-regex -- control characters cannot be in a file name
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100)
  );
}

/** The background images of the looks and the images of the gallery as JPEG files, by their URL, and the QR codes. */
async function loadImages(items: ProjectionItem[]): Promise<Map<string, PptxImage>> {
  const urls = [
    ...new Set(
      items.flatMap((item) => [
        ...(item.look.background.image ? [item.look.background.image] : []),
        ...item.tiles.flatMap((tile) => (tile.slide.kind === "image" ? [tile.slide.url] : [])),
      ]),
    ),
  ];
  const qrTexts = [
    ...new Set(
      items.flatMap((item) => item.tiles.flatMap((tile) => slideQr(tile.slide)?.text ?? [])),
    ),
  ];
  const images = await Promise.all(urls.map(async (url) => [url, await jpegOf(url)] as const));
  const codes = await Promise.all(
    qrTexts.map(async (text) => [qrImageKey(text), await qrJpeg(text)] as const),
  );
  return new Map(
    [...images, ...codes].flatMap(([url, image]) => (image ? [[url, image] as const] : [])),
  );
}

/** The QR code of a text as a JPEG file, black on white, with a white border. Null when it does not render. */
async function qrJpeg(text: string): Promise<PptxImage | null> {
  try {
    const { data } = encode(text, { border: 2 });
    const scale = 16;
    const canvas = document.createElement("canvas");
    canvas.width = data.length * scale;
    canvas.height = data.length * scale;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    data.forEach((row, y) =>
      row.forEach((dark, x) => dark && context.fillRect(x * scale, y * scale, scale, scale)),
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.95),
    );
    const size = { width: canvas.width, height: canvas.height };
    canvas.width = 0;
    canvas.height = 0;
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), ...size } : null;
  } catch {
    return null;
  }
}

/** The image of the URL as a JPEG file, or null when it does not load. */
async function jpegOf(url: string): Promise<PptxImage | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    const size = { width: canvas.width, height: canvas.height };
    // Frees the memory of the canvas at once.
    canvas.width = 0;
    canvas.height = 0;
    return blob ? { data: new Uint8Array(await blob.arrayBuffer()), ...size } : null;
  } catch {
    return null;
  }
}

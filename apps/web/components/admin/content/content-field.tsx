"use client";

import { useMemo, useRef, useState } from "react";
import {
  RichTextEditor,
  type MediaItem,
  type RichTextDoc,
  type RichTextEditorImage,
  type RichTextEditorLabels,
} from "@churchy/ui";
import { DangerIcon } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { docFromText, parseDocValue } from "@/lib/admin/content";
import { ImagePickerDialog, useMediaState } from "@/app/fejlesztes/media/library-client";
import { loadMediaLibrary, type MediaLibraryState } from "@/app/fejlesztes/media/actions";

export interface ContentFieldProps {
  name: string;
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  optionalLabel?: string | undefined;
  /** The stored document as JSON (or plain text from an older form). */
  defaultValue?: string;
  rows?: number;
}

const EMPTY_MEDIA: MediaLibraryState = { items: [], usage: { bytes: 0, quotaBytes: 0 } };

/**
 * The body field of the content forms: the shared rich text editor (`<RichTextEditor>` of
 * `@churchy/ui`, D-19) with the media picker for images. The form posts the document as JSON in a
 * hidden input named `name`; `lib/admin/content.ts` turns it into the stored `RichText` / blocks.
 * The media library is loaded the first time the picker opens.
 */
export function ContentField({
  name,
  label,
  help,
  error,
  required,
  optionalLabel,
  defaultValue = "",
}: ContentFieldProps) {
  const t = useT("admin.content.editor");
  const initial = useMemo<RichTextDoc | null>(
    () => parseDocValue(defaultValue) ?? (defaultValue.trim() ? docFromText(defaultValue) : null),
    [defaultValue],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const media = useMediaState(EMPTY_MEDIA);
  const resolver = useRef<((image: RichTextEditorImage | null) => void) | null>(null);

  const labels = useMemo<RichTextEditorLabels>(
    () => ({
      toolbar: t("toolbar"),
      bold: t("bold"),
      italic: t("italic"),
      heading2: t("heading2"),
      heading3: t("heading3"),
      heading4: t("heading4"),
      bulletList: t("bulletList"),
      orderedList: t("orderedList"),
      blockquote: t("blockquote"),
      horizontalRule: t("horizontalRule"),
      link: t("link"),
      image: t("image"),
      embed: t("embed"),
      undo: t("undo"),
      redo: t("redo"),
      linkUrl: t("linkUrl"),
      linkHelp: t("linkHelp"),
      linkInvalid: t("linkInvalid"),
      linkApply: t("linkApply"),
      linkRemove: t("linkRemove"),
      embedUrl: t("embedUrl"),
      embedHelp: t("embedHelp"),
      embedInvalid: t("embedInvalid"),
      embedApply: t("embedApply"),
      cancel: t("cancel"),
    }),
    [t],
  );

  const settle = (image: RichTextEditorImage | null) => {
    resolver.current?.(image);
    resolver.current = null;
  };

  const pickImage = async () => {
    if (!mediaReady) {
      try {
        media.setState(await loadMediaLibrary());
        setMediaReady(true);
      } catch {
        setMediaFailed(true);
        return null;
      }
    }
    return new Promise<RichTextEditorImage | null>((resolve) => {
      resolver.current = resolve;
      setPickerOpen(true);
    });
  };

  const select = (item: MediaItem) => {
    if (item.src === null) return settle(null);
    settle({
      src: item.src,
      alt: item.decorative ? "" : (item.alt ?? ""),
      width: item.width,
      height: item.height,
    });
    setPickerOpen(false);
  };

  const fullLabel = optionalLabel && !required ? `${label} ${optionalLabel}` : label;
  return (
    <div className="flex flex-col gap-1.5" data-testid={`content-field-${name}`}>
      <RichTextEditor
        key={defaultValue}
        name={name}
        label={fullLabel}
        labels={labels}
        defaultValue={initial}
        onPickImage={pickImage}
      />
      {mediaFailed ? <p className="text-fs-2 text-muted">{t("mediaUnavailable")}</p> : null}
      {error ? (
        <p className="flex items-start gap-2 text-fs-2 font-semibold text-danger" role="alert">
          <DangerIcon className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {help ? <p className="text-fs-2 text-muted">{help}</p> : null}
      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) settle(null);
        }}
        onSelect={select}
        state={media}
      />
    </div>
  );
}

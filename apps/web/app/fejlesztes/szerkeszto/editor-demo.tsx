"use client";

import { useMemo, useRef, useState } from "react";
import {
  RichTextContent,
  RichTextEditor,
  type MediaItem,
  type RichTextDoc,
  type RichTextEditorImage,
  type RichTextEditorLabels,
  type RichTextEmbedLabels,
} from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { MediaLibraryState } from "../media/actions";
import { ImagePickerDialog, useMediaState } from "../media/library-client";

/** Fictitious starting text (CLAUDE.md rule 4). */
const SAMPLE: RichTextDoc = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Adventi lelkigyakorlat" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Szeretettel hívjuk a közösség tagjait a " },
        { type: "text", marks: [{ type: "bold" }], text: "hétvégi csendes napra" },
        { type: "text", text: ". A részletekről a plébánián kaphat tájékoztatást." },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Érkezés: péntek 18:00" }] },
          ],
        },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Zárás: vasárnap 12:00" }] },
          ],
        },
      ],
    },
  ],
};

export function EditorDemo({ initialMedia }: { initialMedia: MediaLibraryState }) {
  const t = useT("dev.editor");
  const [doc, setDoc] = useState<RichTextDoc>(SAMPLE);
  const [pickerOpen, setPickerOpen] = useState(false);
  const media = useMediaState(initialMedia);
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
  const embedLabels = useMemo<RichTextEmbedLabels>(
    () => ({
      frameTitle: (provider) => t("embedFrameTitle", { provider }),
      notice: (provider) => t("embedNotice", { provider }),
      load: t("embedLoad"),
    }),
    [t],
  );

  const settle = (image: RichTextEditorImage | null) => {
    resolver.current?.(image);
    resolver.current = null;
  };

  const pickImage = () =>
    new Promise<RichTextEditorImage | null>((resolve) => {
      resolver.current = resolve;
      setPickerOpen(true);
    });

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

  return (
    <div className="grid gap-8">
      <RichTextEditor
        label={t("fieldLabel")}
        labels={labels}
        defaultValue={SAMPLE}
        onChange={setDoc}
        onPickImage={pickImage}
      />
      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) settle(null);
        }}
        onSelect={select}
        state={media}
      />
      <section aria-labelledby="editor-preview" className="grid gap-3">
        <h2 id="editor-preview" className="font-heading text-fs-5 font-bold">
          {t("previewTitle")}
        </h2>
        <div
          className="rounded-md border-2 border-border bg-surface-raised p-4"
          data-testid="editor-preview"
        >
          <RichTextContent doc={doc} embedLabels={embedLabels} />
        </div>
      </section>
      <section aria-labelledby="editor-json" className="grid gap-3">
        <h2 id="editor-json" className="font-heading text-fs-5 font-bold">
          {t("jsonTitle")}
        </h2>
        <pre
          tabIndex={0}
          className="max-h-80 overflow-auto rounded-md border-2 border-border bg-surface-sunken p-4 text-fs-2"
          data-testid="editor-json"
        >
          {JSON.stringify(doc, null, 2)}
        </pre>
      </section>
    </div>
  );
}

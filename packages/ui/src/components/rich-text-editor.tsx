"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn";
import { Button } from "./button";
import { embedSource } from "./embed";
import { Input } from "./fields";
import { safeHref, safeImageSrc } from "./rich-text";

/**
 * Tiptap editor producing exactly the JSON the allow-list renderer (`RichTextContent`) renders
 * (SDD §3, §13, FR-303): headings h2–h4, bold, italic, links (safe schemes only), bullet/ordered
 * lists, blockquote, rule, images (from the media library) and `embed` nodes for YouTube and
 * OpenStreetMap only. The schema deliberately has nothing else, so pasted Word/Google Docs content
 * (fonts, colours, tables, spans, classes) collapses to these nodes and marks.
 */

/** Plain Tiptap/ProseMirror JSON document, as stored (`RichText` of `@churchy/contracts`). */
export interface RichTextDoc {
  type: "doc";
  content?: unknown[];
}

export interface RichTextEditorImage {
  src: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}

export interface RichTextEditorLabels {
  toolbar: string;
  bold: string;
  italic: string;
  heading2: string;
  heading3: string;
  heading4: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  horizontalRule: string;
  link: string;
  image: string;
  embed: string;
  undo: string;
  redo: string;
  linkUrl: string;
  linkHelp: string;
  linkInvalid: string;
  linkApply: string;
  linkRemove: string;
  embedUrl: string;
  embedHelp: string;
  embedInvalid: string;
  embedApply: string;
  cancel: string;
}

export interface RichTextEditorProps {
  /** Visible label of the field. */
  label: string;
  labels: RichTextEditorLabels;
  /** Initial document (the editor is uncontrolled after mount; remount with `key` to reset). */
  defaultValue?: RichTextDoc | null;
  onChange?: (doc: RichTextDoc) => void;
  /** Opens the media picker; resolves with the chosen image or `null`. Hides the image button when absent. */
  onPickImage?: () => Promise<RichTextEditorImage | null>;
  /** Hidden-input name so the JSON posts with a plain form. */
  name?: string;
  className?: string;
}

const EMPTY_DOC: RichTextDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** Block embed of an allow-listed provider; the stored URL is validated on input and on paste. */
const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { provider: { default: null }, url: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-embed]",
        getAttrs: (el) => {
          const provider = el.getAttribute("data-embed");
          const url = el.getAttribute("data-url");
          return embedSource(provider, url) === null ? false : { provider, url };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const embed = embedSource(node.attrs.provider, node.attrs.url);
    return [
      "div",
      mergeAttributes({
        "data-embed": String(node.attrs.provider),
        "data-url": String(node.attrs.url),
        contenteditable: "false",
        class:
          "flex flex-wrap items-center gap-2 rounded-md border-2 border-dashed border-border-strong bg-surface-sunken p-4 text-fs-2",
      }),
      ["strong", {}, embed?.providerName ?? ""],
      ["span", { class: "break-all text-muted" }, String(node.attrs.url)],
    ];
  },
});

/** Image limited to the attributes the renderer copies. */
const SafeImage = Image.extend({
  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => safeImageSrc(el.getAttribute("src")),
      },
      alt: { default: "" },
      width: { default: null },
      height: { default: null },
    };
  },
});

/** Link limited to `href`: no target, class, title or rel survives a paste (the renderer sets rel). */
const SafeLink = Link.extend({
  addAttributes() {
    return { href: { default: null } };
  },
});

/**
 * Removes what office suites put on the clipboard besides content, before the schema parses it:
 * scripts, styles, comments, Word's fake list bullets (`mso-list:Ignore`) and `<o:p>` fillers.
 */
export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, meta, link, o\\:p, [style*='mso-list:Ignore' i]")
    .forEach((el) => el.remove());
  return doc.body.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
}

/** The editor's schema: everything the allow-list renderer renders, nothing else. */
export function createEditorExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      strike: false,
      underline: false,
      code: false,
      codeBlock: false,
      link: false,
    }),
    SafeLink.configure({
      openOnClick: false,
      autolink: false,
      defaultProtocol: "https",
      protocols: ["mailto", "tel"],
      isAllowedUri: (url) => safeHref(url) !== null,
    }),
    SafeImage.configure({ inline: false, allowBase64: false }),
    Embed,
  ];
}

type Panel = "link" | "embed" | null;

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  tabIndex: number;
}

function ToolButton({ label, active, disabled, onClick, children, tabIndex }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      tabIndex={tabIndex}
      data-tool=""
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md border-2 border-transparent text-fs-3 font-bold text-text",
        "hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-55",
        active && "border-primary bg-primary-soft text-primary",
      )}
    >
      {children}
    </button>
  );
}

const glyph = "pointer-events-none select-none";
/** Symbolic button faces (letters as in a word processor); the accessible names come from `labels`. */
const GLYPHS = { bold: "B", italic: "I", heading: "H" } as const;

function ToolbarIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const CONTENT_CLASS =
  "min-h-56 px-4 py-3 text-fs-4 outline-none flex flex-col gap-4 [&_h2]:font-heading [&_h2]:text-fs-5 [&_h2]:font-bold [&_h3]:font-heading [&_h3]:text-fs-4 [&_h3]:font-bold [&_h4]:text-fs-4 [&_h4]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_hr]:border-border";

/** Tiptap-based rich-text field for the admin (FR-303). Text arrives through `labels`. */
export function RichTextEditor({
  label,
  labels,
  defaultValue,
  onChange,
  onPickImage,
  name,
  className,
}: RichTextEditorProps) {
  const labelId = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [panelUrl, setPanelUrl] = useState("");
  const [panelError, setPanelError] = useState<string | undefined>();
  const [json, setJson] = useState<string>(() => JSON.stringify(defaultValue ?? EMPTY_DOC));
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [roving, setRoving] = useState(0);

  const editor = useEditor({
    extensions: createEditorExtensions(),
    content: (defaultValue ?? EMPTY_DOC) as object,
    immediatelyRender: false,
    editorProps: {
      transformPastedHTML: cleanPastedHtml,
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        class: CONTENT_CLASS,
      },
    },
    onUpdate: ({ editor: updated }) => {
      const doc = updated.getJSON() as RichTextDoc;
      setJson(JSON.stringify(doc));
      onChange?.(doc);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current === null
        ? null
        : {
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            h2: current.isActive("heading", { level: 2 }),
            h3: current.isActive("heading", { level: 3 }),
            h4: current.isActive("heading", { level: 4 }),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            quote: current.isActive("blockquote"),
            link: current.isActive("link"),
            canUndo: current.can().undo(),
            canRedo: current.can().redo(),
          },
  });

  const openPanel = (next: Exclude<Panel, null>, current: Editor) => {
    setPanelError(undefined);
    setPanelUrl(
      next === "link" ? ((current.getAttributes("link").href as string | undefined) ?? "") : "",
    );
    setPanel(next);
  };

  const submitPanel = (e: FormEvent) => {
    e.preventDefault();
    if (editor === null || panel === null) return;
    const value = panelUrl.trim();
    if (panel === "link") {
      const href = value === "" ? null : (safeHref(value) ?? safeHref(`https://${value}`));
      if (href === null) {
        setPanelError(labels.linkInvalid);
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      const provider = embedSource("youtube", value)
        ? "youtube"
        : embedSource("openstreetmap", value)
          ? "openstreetmap"
          : null;
      if (provider === null) {
        setPanelError(labels.embedInvalid);
        return;
      }
      editor
        .chain()
        .focus()
        .insertContent({ type: "embed", attrs: { provider, url: value } })
        .run();
    }
    setPanel(null);
  };

  const pickImage = async () => {
    if (editor === null || onPickImage === undefined) return;
    const picked = await onPickImage();
    if (picked === null) return;
    const src = safeImageSrc(picked.src);
    if (src === null) return;
    editor
      .chain()
      .focus()
      .setImage({
        src,
        alt: picked.alt,
        ...(picked.width ? { width: picked.width } : {}),
        ...(picked.height ? { height: picked.height } : {}),
      })
      .run();
  };

  const onToolbarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const root = toolbarRef.current;
    if (root === null) return;
    const all = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-tool]"));
    const enabled = all.filter((t) => !t.disabled);
    const at = enabled.findIndex((t) => t === document.activeElement);
    if (at < 0) return;
    let next = at;
    if (e.key === "ArrowRight") next = (at + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    if (target === undefined) return;
    target.focus();
    setRoving(all.indexOf(target));
  };

  let index = -1;
  const tab = () => {
    index += 1;
    return index === roving ? 0 : -1;
  };

  return (
    <div className={cn("grid gap-1.5", className)} data-rich-text-editor="">
      <span id={labelId} className="text-fs-3 leading-snug font-semibold text-text">
        {label}
      </span>
      <div className="rounded-md border-2 border-border-strong bg-surface-raised focus-within:border-primary">
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={labels.toolbar}
          aria-orientation="horizontal"
          onKeyDown={onToolbarKey}
          className="flex flex-wrap gap-1 border-b-2 border-border bg-surface-sunken p-1"
        >
          <ToolButton
            tabIndex={tab()}
            label={labels.bold}
            active={state?.bold ?? false}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <span aria-hidden="true" className={glyph}>
              {GLYPHS.bold}
            </span>
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.italic}
            active={state?.italic ?? false}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <span aria-hidden="true" className={cn(glyph, "italic")}>
              {GLYPHS.italic}
            </span>
          </ToolButton>
          {([2, 3, 4] as const).map((level) => (
            <ToolButton
              key={level}
              tabIndex={tab()}
              label={labels[`heading${level}` as const]}
              active={state?.[`h${level}` as const] ?? false}
              onClick={() => editor?.chain().focus().toggleHeading({ level }).run()}
            >
              <span aria-hidden="true" className={glyph}>
                {GLYPHS.heading}
                {level}
              </span>
            </ToolButton>
          ))}
          <ToolButton
            tabIndex={tab()}
            label={labels.bulletList}
            active={state?.bullet ?? false}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ToolbarIcon d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.orderedList}
            active={state?.ordered ?? false}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ToolbarIcon d="M10 6h11M10 12h11M10 18h11M4 5l1.5-1V9M3.5 14h3l-3 4h3" />
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.blockquote}
            active={state?.quote ?? false}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <span aria-hidden="true" className={glyph}>
              &ldquo;
            </span>
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.horizontalRule}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <ToolbarIcon d="M4 12h16" />
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.link}
            active={state?.link ?? false}
            onClick={() => editor && openPanel("link", editor)}
          >
            <ToolbarIcon d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </ToolButton>
          {onPickImage ? (
            <ToolButton tabIndex={tab()} label={labels.image} onClick={() => void pickImage()}>
              <ToolbarIcon d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01" />
            </ToolButton>
          ) : null}
          <ToolButton
            tabIndex={tab()}
            label={labels.embed}
            onClick={() => editor && openPanel("embed", editor)}
          >
            <ToolbarIcon d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.undo}
            disabled={!state?.canUndo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <ToolbarIcon d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
          </ToolButton>
          <ToolButton
            tabIndex={tab()}
            label={labels.redo}
            disabled={!state?.canRedo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <ToolbarIcon d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
          </ToolButton>
        </div>
        {panel !== null && editor ? (
          <form
            onSubmit={submitPanel}
            className="flex flex-wrap items-start gap-3 border-b-2 border-border p-3"
            data-testid={`editor-panel-${panel}`}
          >
            <Input
              label={panel === "link" ? labels.linkUrl : labels.embedUrl}
              help={panel === "link" ? labels.linkHelp : labels.embedHelp}
              error={panelError}
              value={panelUrl}
              onChange={(e) => {
                setPanelUrl(e.target.value);
                setPanelError(undefined);
              }}
              autoFocus
              wrapperClassName="min-w-60 flex-1"
            />
            <div className="flex flex-wrap gap-2 pt-7">
              <Button type="submit" size="sm">
                {panel === "link" ? labels.linkApply : labels.embedApply}
              </Button>
              {panel === "link" && state?.link ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    setPanel(null);
                  }}
                >
                  {labels.linkRemove}
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="ghost" onClick={() => setPanel(null)}>
                {labels.cancel}
              </Button>
            </div>
          </form>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      {name ? <input type="hidden" name={name} value={json} /> : null}
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  Undo2Icon,
  UnlinkIcon,
  type LucideIcon,
} from "lucide-react";

import { RICH_TEXT_CLASS } from "@/components/music/rich-text-view";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { toLinkUrl } from "@/lib/music/links";
import { EMPTY_RICH_TEXT, normalizeRichText, type RichDoc } from "@/lib/music/rich-text";
import { cn } from "@/lib/music/utils";

/**
 * The text of a lesson with a toolbar: headings, bold, italic, lists, quotes
 * and links. Only these nodes and marks exist in the editor, so a paste
 * keeps only them too. `value` is read only at the start: give the
 * component a new `key` to load another text.
 */
export function RichTextEditor({
  value,
  onChange,
  labelId,
  describedBy,
  invalid,
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  /** The id of the label of the field. */
  labelId: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https"],
          isAllowedUri: (url) => toLinkUrl(url) !== null,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer", class: null },
        },
      }),
    ],
    content: value,
    // Next.js renders the page on the server first: the editor starts in the browser.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(RICH_TEXT_CLASS, "min-h-48 px-3 py-2 outline-none"),
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(invalid ? { "aria-invalid": "true" } : {}),
      },
    },
    onUpdate: ({ editor }) => onChange(normalizeRichText(editor.getJSON()) ?? EMPTY_RICH_TEXT),
  });

  return (
    <div
      className={cn(
        "flex flex-col rounded-card border border-border-strong bg-surface-raised focus-within:border-focus focus-within:ring-3 focus-within:ring-focus/50",
        invalid && "border-danger ring-3 ring-danger/20",
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-10 border-b" />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const { m } = useI18n();
  const t = m.courses.editor.text;
  const linkId = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState(false);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      blockquote: editor.isActive("blockquote"),
      link: editor.isActive("link"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  function openLink() {
    setLinkUrl(editor.getAttributes("link").href ?? "");
    setLinkError(false);
    setLinkOpen(true);
  }

  function applyLink() {
    const href = linkUrl.trim() === "" ? null : toLinkUrl(linkUrl);
    if (linkUrl.trim() !== "" && !href) {
      setLinkError(true);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) chain.setLink({ href }).run();
    else chain.unsetLink().run();
    setLinkOpen(false);
  }

  const tool = (
    label: string,
    Icon: LucideIcon,
    active: boolean,
    run: () => void,
    disabled = false,
  ) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(active && "bg-surface-sunken text-text")}
      // The editor keeps its selection: the button does not take the focus.
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
    >
      <Icon />
    </Button>
  );

  return (
    <div className="flex flex-col border-b">
      <div
        role="toolbar"
        aria-label={t.toolbar}
        className="flex flex-wrap items-center gap-0.5 p-1"
      >
        {tool(t.bold, BoldIcon, state.bold, () => editor.chain().focus().toggleBold().run())}
        {tool(t.italic, ItalicIcon, state.italic, () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {tool(t.heading, Heading2Icon, state.h2, () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {tool(t.subheading, Heading3Icon, state.h3, () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {tool(t.bulletList, ListIcon, state.bulletList, () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {tool(t.orderedList, ListOrderedIcon, state.orderedList, () =>
          editor.chain().focus().toggleOrderedList().run(),
        )}
        {tool(t.quote, QuoteIcon, state.blockquote, () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {tool(t.link, LinkIcon, state.link, openLink)}
        {state.link &&
          tool(t.removeLink, UnlinkIcon, false, () =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run(),
          )}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {tool(t.undo, Undo2Icon, false, () => editor.chain().focus().undo().run(), !state.canUndo)}
        {tool(t.redo, Redo2Icon, false, () => editor.chain().focus().redo().run(), !state.canRedo)}
      </div>
      {linkOpen && (
        <div className="flex flex-col gap-1 border-t p-2">
          <label htmlFor={linkId} className="text-sm font-medium">
            {t.linkAddress}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              // It shows after a click on "Link": the focus goes to it.
              autoFocus
              id={linkId}
              type="url"
              inputMode="url"
              value={linkUrl}
              placeholder="https://"
              className="min-w-48 flex-1"
              aria-invalid={linkError || undefined}
              aria-describedby={`${linkId}-description`}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setLinkOpen(false);
                  editor.commands.focus();
                }
              }}
            />
            <Button type="button" size="sm" onClick={applyLink}>
              {t.applyLink}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
              {m.common.actions.cancel}
            </Button>
          </div>
          <p
            id={`${linkId}-description`}
            className={cn("text-xs", linkError ? "text-danger" : "text-muted")}
          >
            {linkError ? m.server.courses.linkUrl : t.linkHint}
          </p>
        </div>
      )}
    </div>
  );
}

import { Textarea, type TextareaProps } from "@churchy/ui";

/**
 * The body field of the content forms. Until the rich text editor (D-19, `<RichTextEditor>` in
 * `@churchy/ui`) is merged this is a plain textarea: paragraphs are separated by a blank line.
 * Every content form uses this wrapper only, so swapping in the editor is a change in this file
 * (the form then submits the editor's JSON instead of text and the save helpers in
 * `lib/admin/content.ts` go away).
 */
export function ContentField({ rows = 12, ...props }: TextareaProps) {
  return <Textarea rows={rows} {...props} />;
}

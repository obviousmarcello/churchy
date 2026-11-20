import { Editor } from "@tiptap/core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RichTextContent,
  RichTextEditor,
  type RichTextDoc,
  type RichTextEditorLabels,
  type RichTextEmbedLabels,
} from "../index";
import { cleanPastedHtml, createEditorExtensions } from "./rich-text-editor";

const labels: RichTextEditorLabels = {
  toolbar: "Szövegformázás",
  bold: "Félkövér",
  italic: "Dőlt",
  heading2: "Alcím 2",
  heading3: "Alcím 3",
  heading4: "Alcím 4",
  bulletList: "Felsorolás",
  orderedList: "Számozott lista",
  blockquote: "Idézet",
  horizontalRule: "Vonal",
  link: "Hivatkozás",
  image: "Kép",
  embed: "Beágyazás",
  undo: "Visszavonás",
  redo: "Újra",
  linkUrl: "Hivatkozás címe",
  linkHelp: "súgó",
  linkInvalid: "Érvénytelen cím",
  linkApply: "Beállítás",
  linkRemove: "Törlés",
  embedUrl: "Beágyazás címe",
  embedHelp: "súgó",
  embedInvalid: "Nem engedélyezett beágyazás",
  embedApply: "Beágyazás beszúrása",
  cancel: "Mégse",
};

const embedLabels: RichTextEmbedLabels = {
  frameTitle: (p) => `${p} keret`,
  notice: (p) => `${p} értesítés`,
  load: "Betöltés",
};

/** Pasted/loaded HTML through the editor schema, as the editor would store it. */
function parse(html: string): RichTextDoc {
  const editor = new Editor({
    extensions: createEditorExtensions(),
    content: cleanPastedHtml(html),
  });
  const json = editor.getJSON() as RichTextDoc;
  editor.destroy();
  return json;
}

function typesIn(node: unknown, found = new Set<string>()): Set<string> {
  if (node === null || typeof node !== "object") return found;
  const n = node as { type?: string; marks?: { type: string }[]; content?: unknown[] };
  if (n.type) found.add(n.type);
  n.marks?.forEach((m) => found.add(`mark:${m.type}`));
  n.content?.forEach((c) => typesIn(c, found));
  return found;
}

// Five reference documents as the clipboard delivers them (AC 1).
const REFERENCE_DOCS: Record<string, string> = {
  word:
    '<html><body><!--StartFragment--><p class="MsoNormal" style="margin:0cm;font-size:11pt;font-family:Calibri">' +
    '<span style="mso-bidi-font-weight:bold"><b>Fontos</b></span><o:p></o:p> hírek</p>' +
    '<p class="MsoListParagraph" style="text-indent:-18pt"><span style="mso-list:Ignore">·</span>Első</p><!--EndFragment--></body></html>',
  googleDocs:
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1f0a">' +
    '<h2 dir="ltr" style="line-height:1.38"><span style="font-size:16pt;color:#000">Cím</span></h2>' +
    '<p dir="ltr"><span style="font-weight:700">Vastag</span><span style="font-style:italic"> dőlt</span></p></b>',
  libreOffice:
    '<p style="margin-bottom:0.25cm"><font face="Liberation Serif, serif"><font size="3"><u>Aláhúzott</u> szöveg</font></font></p>' +
    "<table><tr><td>cella</td></tr></table>",
  web:
    '<div class="article"><h1>Főcím</h1><p>Szöveg <a href="https://example.org/oldal" onclick="alert(1)" target="_blank" class="x">hivatkozás</a></p>' +
    "<script>alert(1)</script><style>p{color:red}</style></div>",
  plain: "<p>Egyszerű bekezdés</p><ul><li>egy</li><li>kettő</li></ul>",
};

describe("paste cleanup (reference documents)", () => {
  it.each(Object.entries(REFERENCE_DOCS))("%s collapses to allow-listed nodes", (_name, html) => {
    const json = parse(html);
    const allowed = new Set([
      "doc",
      "paragraph",
      "heading",
      "text",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "horizontalRule",
      "image",
      "embed",
      "hardBreak",
      "mark:bold",
      "mark:italic",
      "mark:link",
    ]);
    for (const type of typesIn(json)) expect(allowed).toContain(type);
    // Only the keys of the stored JSON matter, not words in the text.
    const keys =
      JSON.stringify(json)
        .match(/"([a-zA-Z]+)":/g)
        ?.join("") ?? "";
    expect(keys).not.toMatch(/style|class|font|onclick|color|target/i);
    expect(JSON.stringify(json)).not.toMatch(/alert|mso|·/);
  });

  it("keeps bold from Word and Google Docs", () => {
    expect(typesIn(parse(REFERENCE_DOCS.word ?? ""))).toContain("mark:bold");
    const google = parse(REFERENCE_DOCS.googleDocs ?? "");
    expect(typesIn(google)).toContain("mark:bold");
    expect(typesIn(google)).toContain("mark:italic");
    expect(typesIn(google)).toContain("heading");
  });

  it("keeps the heading of a pasted h1 within h2–h4 and drops scripts and styles", () => {
    const json = JSON.stringify(parse(REFERENCE_DOCS.web ?? ""));
    expect(json).not.toContain('"level":1');
    expect(json).not.toContain("alert");
    expect(json).toContain("https://example.org/oldal");
  });

  it("renders the cleaned document through the allow-list renderer", () => {
    const { container } = render(
      <RichTextContent doc={parse(REFERENCE_DOCS.googleDocs ?? "")} embedLabels={embedLabels} />,
    );
    expect(container.querySelector("h2")).toHaveTextContent("Cím");
    expect(container.querySelector("strong")).toHaveTextContent("Vastag");
    expect(container.querySelector("[style]")).toBeNull();
  });
});

describe("unsafe input", () => {
  it.each([
    '<a href="javascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
    '<a href="vbscript:msgbox">x</a>',
  ])("drops the link target of %s", (html) => {
    expect(JSON.stringify(parse(`<p>${html}</p>`))).not.toMatch(/javascript|data:|vbscript/);
  });

  it.each([
    '<img src="javascript:alert(1)">',
    '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    '<img src="http://insecure.example/a.png">',
  ])("does not keep %s", (html) => {
    const json = JSON.stringify(parse(html));
    expect(json).not.toMatch(/javascript|data:|http:\/\/insecure/);
  });

  it("accepts embed markup only for allow-listed providers", () => {
    const ok = parse(
      '<div data-embed="youtube" data-url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></div>',
    );
    expect(typesIn(ok)).toContain("embed");
    for (const html of [
      '<div data-embed="youtube" data-url="https://evil.example/watch?v=dQw4w9WgXcQ"></div>',
      '<div data-embed="vimeo" data-url="https://vimeo.com/1"></div>',
      '<div data-embed="youtube" data-url="javascript:alert(1)"></div>',
    ]) {
      expect(typesIn(parse(html))).not.toContain("embed");
    }
  });

  it("the renderer rebuilds embeds from the allow-list and drops others", () => {
    const youtube = {
      type: "embed",
      attrs: { provider: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" },
    };
    const evil = { type: "embed", attrs: { provider: "youtube", url: "https://evil.example/x" } };
    const { container } = render(
      <RichTextContent doc={{ type: "doc", content: [youtube, evil] }} embedLabels={embedLabels} />,
    );
    expect(container.querySelectorAll("[data-block='embed']")).toHaveLength(1);
    expect(container.querySelector("iframe")).toBeNull(); // click-to-load
    expect(container.innerHTML).not.toContain("evil.example");
    const noLabels = render(<RichTextContent doc={{ type: "doc", content: [youtube] }} />);
    expect(noLabels.container.querySelector("[data-block='embed']")).toBeNull();
  });
});

describe("<RichTextEditor>", () => {
  it("renders a labelled toolbar and editing area", async () => {
    render(<RichTextEditor label="Tartalom" labels={labels} />);
    expect(screen.getByRole("toolbar", { name: "Szövegformázás" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Félkövér" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Tartalom" })).toBeVisible());
  });

  it("hides the image button without a picker and shows it with one", () => {
    const { rerender } = render(<RichTextEditor label="Tartalom" labels={labels} />);
    expect(screen.queryByRole("button", { name: "Kép" })).toBeNull();
    rerender(
      <RichTextEditor label="Tartalom" labels={labels} onPickImage={() => Promise.resolve(null)} />,
    );
    expect(screen.getByRole("button", { name: "Kép" })).toBeInTheDocument();
  });

  it("rejects an embed outside the allow-list and inserts a YouTube one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor label="Tartalom" labels={labels} onChange={onChange} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Beágyazás" }));
    const input = screen.getByRole("textbox", { name: "Beágyazás címe" });
    await user.type(input, "https://vimeo.com/123456");
    await user.click(screen.getByRole("button", { name: "Beágyazás beszúrása" }));
    expect(screen.getByText("Nem engedélyezett beágyazás")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await user.click(screen.getByRole("button", { name: "Beágyazás beszúrása" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)?.[0] as RichTextDoc;
    expect(JSON.stringify(last)).toContain('"provider":"youtube"');
  });

  it("rejects a javascript: link", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor label="Tartalom" labels={labels} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Hivatkozás" }));
    await user.type(
      screen.getByRole("textbox", { name: "Hivatkozás címe" }),
      "javascript:alert(1)",
    );
    await user.click(screen.getByRole("button", { name: "Beállítás" }));
    expect(screen.getByText("Érvénytelen cím")).toBeInTheDocument();
  });

  it("inserts the picked image with its alt text", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RichTextEditor
        label="Tartalom"
        labels={labels}
        onChange={onChange}
        onPickImage={() =>
          Promise.resolve({ src: "/demo/templom.svg", alt: "A templom", width: 1600, height: 900 })
        }
      />,
    );
    await waitFor(() => expect(screen.getByRole("textbox")).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Kép" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const json = JSON.stringify(onChange.mock.calls.at(-1)?.[0]);
    expect(json).toContain('"alt":"A templom"');
    expect(json).toContain('"src":"/demo/templom.svg"');
  });

  it("posts the document through a hidden input when named", async () => {
    const { container } = render(<RichTextEditor label="Tartalom" labels={labels} name="body" />);
    const hidden = container.querySelector<HTMLInputElement>("input[name=body]");
    expect(hidden).not.toBeNull();
    expect(JSON.parse(hidden?.value ?? "{}")).toMatchObject({ type: "doc" });
  });
});

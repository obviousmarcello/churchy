import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PageBlocks, embedSource, type PageBlocksLabels } from "../index";

const labels: PageBlocksLabels = {
  gallery: "Képgaléria",
  fileInfo: (f) => `PDF, ${f.kilobytes} kB`,
  embed: {
    notice: (p) => `A videót a(z) ${p} szolgáltatja.`,
    load: "Videó betöltése",
    frameTitle: (p) => `${p}-videó`,
  },
};

const images = {
  "img-1": { src: "/demo/templom.svg", alt: "A templom homlokzata", width: 1600, height: 900 },
  "img-2": { src: "/demo/templom.svg", alt: "A templom belseje" },
  "img-bad": { src: "javascript:alert(1)", alt: "x" },
};
const files = { "pdf-1": { href: "/demo/minta.pdf", filename: "minta.pdf", kilobytes: 47 } };

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const ALL_BLOCKS = [
  { type: "heading", text: "Bevezető", level: 2 },
  { type: "heading", text: "Alcím", level: 3 },
  { type: "text", content: doc("Szöveges bekezdés.") },
  { type: "image", mediaId: "img-1", caption: "Képaláírás" },
  { type: "gallery", mediaIds: ["img-1", "img-2", "ismeretlen"] },
  { type: "quote", text: "Idézet szövege.", source: "Forrás" },
  { type: "embed", provider: "youtube", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" },
  { type: "cta", label: "Kapcsolat", href: "/kapcsolat" },
  { type: "file", mediaId: "pdf-1", label: "Letölthető leírás" },
];

function renderBlocks(blocks: unknown[]) {
  return render(<PageBlocks blocks={blocks} images={images} files={files} labels={labels} />);
}

describe("PageBlocks", () => {
  it("renders all eight block types", () => {
    const { container } = renderBlocks(ALL_BLOCKS);
    const types = [...container.querySelectorAll("[data-block]")].map((el) =>
      el.getAttribute("data-block"),
    );
    expect(new Set(types)).toEqual(
      new Set(["heading", "text", "image", "gallery", "quote", "embed", "cta", "file"]),
    );
    expect(screen.getByRole("heading", { level: 2, name: "Bevezető" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Alcím" })).toBeInTheDocument();
    expect(screen.getByText("Szöveges bekezdés.")).toBeInTheDocument();
    expect(screen.getByText("Képaláírás").tagName).toBe("FIGCAPTION");
    // Unknown gallery media are skipped.
    expect(screen.getByRole("list", { name: "Képgaléria" }).querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Idézet szövege.").closest("blockquote")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Kapcsolat" })).toHaveAttribute("href", "/kapcsolat");
    const file = screen.getByRole("link", { name: "Letölthető leírás" });
    expect(file).toHaveAttribute("href", "/demo/minta.pdf");
    expect(file).toHaveAttribute("download", "minta.pdf");
    expect(screen.getByText("PDF, 47 kB")).toBeInTheDocument();
  });

  it("loads an embed only after the click, from the privacy-friendly host", async () => {
    const { container } = renderBlocks([ALL_BLOCKS[6]]);
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("A videót a(z) YouTube szolgáltatja.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Videó betöltése" }));
    const frame = container.querySelector("iframe");
    expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ");
    expect(frame).toHaveAttribute("title", "YouTube-videó");
  });

  it("drops unknown block types, disallowed embeds and unsafe content", () => {
    const { container } = renderBlocks([
      { type: "html", html: "<script>alert(1)</script>" },
      { type: "embed", provider: "facebook", url: "https://www.facebook.com/video.php?v=1" },
      { type: "embed", provider: "youtube", url: "https://evil.example/watch?v=aqz-KE-bpKQ" },
      { type: "embed", provider: "openstreetmap", url: "javascript:alert(1)" },
      { type: "cta", label: "Kattintson", href: "javascript:alert(1)" },
      { type: "image", mediaId: "img-bad", caption: null },
      { type: "image", mediaId: "nincs", caption: null },
      { type: "gallery", mediaIds: ["nincs"] },
      { type: "file", mediaId: "nincs", label: "Fájl" },
      { type: "heading", text: "" },
      { type: "quote", text: 42 },
      null,
      "szöveg",
    ]);
    expect(container.innerHTML).toBe("");
  });

  it("keeps the allowed blocks next to dropped ones", () => {
    renderBlocks([{ type: "unknown" }, { type: "heading", text: "Megmarad", level: 2 }]);
    expect(screen.getByRole("heading", { name: "Megmarad" })).toBeInTheDocument();
  });

  it("marks external CTA links", () => {
    renderBlocks([{ type: "cta", label: "Egyházmegye", href: "https://example.org" }]);
    expect(screen.getByRole("link", { name: "Egyházmegye" })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow",
    );
  });
});

describe("embedSource", () => {
  it.each([
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10", "aqz-KE-bpKQ"],
    ["https://youtu.be/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://m.youtube.com/watch?v=aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://www.youtube.com/embed/aqz-KE-bpKQ?autoplay=1", "aqz-KE-bpKQ"],
    ["https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://www.youtube.com/shorts/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
  ])("rebuilds YouTube %s on youtube-nocookie.com", (url, id) => {
    expect(embedSource("youtube", url)?.src).toBe(`https://www.youtube-nocookie.com/embed/${id}`);
  });

  it.each([
    [
      "https://www.openstreetmap.org/export/embed.html?bbox=19.05,47.49,19.07,47.50&marker=47.495,19.06&x=1",
      "https://www.openstreetmap.org/export/embed.html?bbox=19.05%2C47.49%2C19.07%2C47.5&layer=mapnik&marker=47.495%2C19.06",
    ],
    [
      "https://www.openstreetmap.org/?mlat=47.495&mlon=19.06#map=17/47.495/19.06",
      "https://www.openstreetmap.org/export/embed.html?bbox=19.055%2C47.492%2C19.065%2C47.498&layer=mapnik&marker=47.495%2C19.06",
    ],
  ])("rebuilds the OpenStreetMap map %s from validated coordinates", (url, src) => {
    expect(embedSource("openstreetmap", url)?.src).toBe(src);
  });

  it.each([
    ["youtube", "http://www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["youtube", "https://www.youtube.com.evil.example/watch?v=aqz-KE-bpKQ"],
    ["youtube", "https://user:pw@www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["youtube", "https://www.youtube.com/watch?v=rövid"],
    ["youtube", "https://www.youtube.com/channel/abc"],
    ["youtube", "https://vimeo.com/76979871"],
    ["vimeo", "https://vimeo.com/76979871"],
    ["facebook", "https://www.facebook.com/video.php?v=1"],
    ["soundcloud", "https://soundcloud.com/a/b"],
    ["openstreetmap", "https://www.openstreetmap.org/"],
    ["openstreetmap", "https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,999"],
    ["openstreetmap", "https://www.openstreetmap.org.evil.example/?mlat=47&mlon=19"],
    ["openstreetmap", "https://www.openstreetmap.org/?mlat=47&mlon=abc"],
    ["openstreetmap", "https://www.youtube.com/watch?v=aqz-KE-bpKQ"],
    ["youtube", "nem url"],
    ["youtube", 42],
  ])("drops %s %s", (provider, url) => {
    expect(embedSource(provider, url)).toBeNull();
  });
});

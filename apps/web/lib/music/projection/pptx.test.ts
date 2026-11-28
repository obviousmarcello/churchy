import { describe, expect, it } from "vitest";

import { unzip } from "@/test/music/unzip";
import { escapeXml } from "@/lib/music/xml";
import { projectionPptx, slideFont } from "./pptx";
import {
  buildProjectionItems,
  DEFAULT_ASPECT_RATIO,
  fits,
  SLIDE_LAYOUT,
  type ProjectionSource,
} from "./slides";
import { FALLBACK_LOOK, type ProjectionLook } from "./themes";

const SOURCES: ProjectionSource[] = [
  {
    kind: "song",
    key: "1",
    title: "Lorem & Ipsum",
    copyright: "© Dolor\nCCLI 123",
    chordpro: `{start_of_verse: Verse 1}
[G]Lorem ip[C]sum <dolor>
sit amet

consectetur
{end_of_verse}
{start_of_chorus}
[C]Adipiscing [G]elit
{end_of_chorus}`,
    sectionOrder: [],
  },
  { kind: "text", key: "2", title: "Prayer" },
  { kind: "text", key: "3", title: "John 3:16", scripture: true },
  {
    kind: "textSlide",
    key: "4",
    title: "Prayer theme",
    description: "We pray for",
    highlight: "Our families",
  },
];

function pptxText(aspectRatio = DEFAULT_ASPECT_RATIO) {
  const items = buildProjectionItems(SOURCES, aspectRatio);
  const entries = unzip(
    projectionPptx(items, {
      title: "Sunday",
      aspectRatio,
      lang: "en",
      date: new Date("2026-10-20T10:00:00Z"),
    }),
  );
  const decoder = new TextDecoder();
  return new Map([...entries].map(([path, data]) => [path, decoder.decode(data)]));
}

describe("projectionPptx", () => {
  it("has a slide for each tile, in order", () => {
    const parts = pptxText();
    const slides = [...parts.keys()].filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
    // The title, the verse, the chorus; the prayer; the reference; the text slide and its text.
    expect(slides).toEqual([1, 2, 3, 4, 5, 6, 7].map((number) => `ppt/slides/slide${number}.xml`));
    expect(parts.get("ppt/slides/slide1.xml")).toContain("<a:t>Lorem &amp; Ipsum</a:t>");
    expect(parts.get("ppt/slides/slide1.xml")).toContain("<a:t>© Dolor</a:t>");
    expect(parts.get("ppt/slides/slide1.xml")).toContain("<a:t>CCLI 123</a:t>");
    expect(parts.get("ppt/slides/slide2.xml")).toContain("<a:t>Lorem ipsum &lt;dolor&gt;</a:t>");
    // Two paragraphs: the second has the space before it.
    expect(parts.get("ppt/slides/slide2.xml")?.match(/<a:p>/g)).toHaveLength(2);
    expect(parts.get("ppt/slides/slide2.xml")).toContain("<a:spcBef>");
    expect(parts.get("ppt/slides/slide3.xml")).toContain("<a:t>Adipiscing elit</a:t>");
    // The text item is a slide without text: its title is only for the stream overlay.
    expect(parts.get("ppt/slides/slide4.xml")).not.toContain("<p:sp>");
    expect(parts.get("ppt/slides/slide5.xml")).toContain("<a:t>John 3:16</a:t>");
    // The text slide: a slide without text, then its description and its highlighted text in bold, without its title.
    expect(parts.get("ppt/slides/slide6.xml")).not.toContain("<p:sp>");
    expect(parts.get("ppt/slides/slide7.xml")).toContain("<a:t>We pray for</a:t>");
    expect(parts.get("ppt/slides/slide7.xml")).toMatch(/b="1"[^>]*>.*<a:t>Our families<\/a:t>/);
    expect(parts.get("ppt/slides/slide7.xml")).not.toContain("Prayer theme");
  });

  it("has the verses of a scripture reading with their numbers and the reference", () => {
    const items = buildProjectionItems(
      [{ kind: "text", key: "3", title: "Jn 3,16-17", scripture: true }],
      DEFAULT_ASPECT_RATIO,
      new Map([
        [
          "3",
          {
            translation: {
              id: "x",
              language: "hu",
              name: "Lorem",
              shortName: "L",
              notice: null,
              deuterocanon: false,
              source: "files" as const,
            },
            verses: [
              { chapter: 3, verse: 16, text: "Lorem <ipsum>." },
              { chapter: 3, verse: 17, text: "Dolor." },
            ],
          },
        ],
      ]),
    );
    const entries = unzip(
      projectionPptx(items, { title: "Sunday", aspectRatio: DEFAULT_ASPECT_RATIO, lang: "hu" }),
    );
    const slide = new TextDecoder().decode(entries.get("ppt/slides/slide2.xml"));
    expect(slide).toMatch(/baseline="30000"[^>]*>.*?<a:t>16\u00A0<\/a:t>/);
    expect(slide).toContain("<a:t>Lorem &lt;ipsum&gt;. </a:t>");
    expect(slide).toContain("<a:t>Dolor.</a:t>");
    expect(slide).toContain("<a:t>Jn 3,16–17 (L)</a:t>");
  });

  it("lists each slide in the presentation, its relationships and the content types", () => {
    const parts = pptxText();
    const presentation = parts.get("ppt/presentation.xml")!;
    expect(presentation.match(/<p:sldId /g)).toHaveLength(7);
    const relationships = parts.get("ppt/_rels/presentation.xml.rels")!;
    for (const match of presentation.matchAll(/<p:sldId id="\d+" r:id="(rId\d+)"\/>/g)) {
      expect(relationships).toMatch(
        new RegExp(`Id="${match[1]}" Type="[^"]+/slide" Target="slides/slide\\d+\\.xml"`),
      );
    }
    const contentTypes = parts.get("[Content_Types].xml")!;
    for (const path of parts.keys()) {
      if (path.endsWith(".rels") || path === "[Content_Types].xml") continue;
      expect(contentTypes).toContain(`PartName="/${path}"`);
    }
    expect(parts.get("docProps/core.xml")).toContain("<dc:title>Sunday</dc:title>");
  });

  it("has the shape of the screens", () => {
    expect(pptxText(16 / 9).get("ppt/presentation.xml")).toContain(
      '<p:sldSz cx="12192000" cy="6858000"/>',
    );
    expect(pptxText(4 / 3).get("ppt/presentation.xml")).toContain(
      '<p:sldSz cx="9144000" cy="6858000"/>',
    );
  });
});

describe("slideFont", () => {
  it("is the largest size for a short text", () => {
    expect(slideFont([["Lorem"]], DEFAULT_ASPECT_RATIO)).toBe(SLIDE_LAYOUT.maxFont);
  });

  it("is a size at which the text fits", () => {
    const paragraphs = [
      Array.from({ length: 6 }, () => "Lorem ipsum dolor sit amet, consectetur adipiscing"),
    ];
    const font = slideFont(paragraphs, DEFAULT_ASPECT_RATIO);
    expect(font).toBeLessThan(SLIDE_LAYOUT.maxFont);
    expect(fits(paragraphs, DEFAULT_ASPECT_RATIO, font)).toBe(true);
    expect(fits(paragraphs, DEFAULT_ASPECT_RATIO, font / 0.96)).toBe(false);
  });

  it("is smaller in less space, e.g. a title above the copyright", () => {
    const title = [["Lorem ipsum dolor sit amet ".repeat(5).trim()]];
    const full = slideFont(title, DEFAULT_ASPECT_RATIO);
    const font = slideFont(title, DEFAULT_ASPECT_RATIO, 0.6);
    expect(font).toBeLessThan(full);
    expect(fits(title, DEFAULT_ASPECT_RATIO, font, 0.6)).toBe(true);
  });
});

describe("escapeXml", () => {
  it("escapes the markup and leaves out the characters that XML does not allow", () => {
    expect(escapeXml(`a & b < c > "d"`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
    expect(escapeXml("a\u0000b\u000Bc\tdé😀")).toBe("abc\tdé😀");
  });
});

describe("projectionPptx with themes", () => {
  const image =
    "/munkater/vetites/fajl/hatter/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";
  const look: ProjectionLook = {
    ...FALLBACK_LOOK,
    background: { color: "#102030", image, video: null, dim: 40 },
    font: "montserrat",
    textColor: "#ffee00",
    textAlign: "left",
    verticalAlign: "bottom",
    textShadow: "strong",
    transition: { kind: "fade", ms: 1000, rollMs: 600 },
  };

  function themedParts(images: Map<string, { data: Uint8Array; width: number; height: number }>) {
    const items = buildProjectionItems(
      SOURCES.slice(0, 1),
      DEFAULT_ASPECT_RATIO,
      new Map(),
      () => look,
    );
    const entries = unzip(
      projectionPptx(items, {
        title: "Sunday",
        aspectRatio: DEFAULT_ASPECT_RATIO,
        lang: "en",
        images,
      }),
    );
    const decoder = new TextDecoder();
    return new Map(
      [...entries].map(([path, data]) => [
        path,
        path.endsWith(".jpeg") ? `${data.length}` : decoder.decode(data),
      ]),
    );
  }

  it("has the look of the theme: the image, the dim, the font, the colors, the alignment and the fade", () => {
    const parts = themedParts(
      new Map([[image, { data: new Uint8Array([1, 2, 3]), width: 3200, height: 1200 }]]),
    );
    const slide = parts.get("ppt/slides/slide2.xml")!;
    expect(slide).toContain('<a:blip r:embed="rId2"/>');
    // A wider image than the slide: its sides are cut off.
    expect(slide).toMatch(/<a:srcRect l="\d+" r="\d+"\/>/);
    expect(slide).toContain('name="Dim"');
    expect(slide).toContain('<a:alpha val="40000"/>');
    expect(slide).toContain('<a:latin typeface="Montserrat"/>');
    expect(slide).toContain('<a:srgbClr val="FFEE00">');
    expect(slide).toContain('algn="l"');
    expect(slide).toContain('anchor="b"');
    expect(slide).toContain("<a:outerShdw");
    expect(slide).toContain('<p:transition spd="slow"><p:fade/></p:transition>');
    // One file for all slides of the image.
    expect([...parts.keys()].filter((path) => path.startsWith("ppt/media/"))).toEqual([
      "ppt/media/image1.jpeg",
    ]);
    expect(parts.get("ppt/slides/_rels/slide1.xml.rels")).toContain(
      'Target="../media/image1.jpeg"',
    );
    expect(parts.get("[Content_Types].xml")).toContain(
      '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    );
  });

  it("has the background color when the image did not load", () => {
    const slide = themedParts(new Map()).get("ppt/slides/slide2.xml")!;
    expect(slide).toContain('<p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill>');
    expect(slide).not.toContain("<a:blip");
    expect(slide).not.toContain('name="Dim"');
  });
});

describe("projectionPptx with images of the gallery", () => {
  const url =
    "/munkater/esemenyek/fajl/kep/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp";
  const background =
    "/munkater/vetites/fajl/hatter/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000003.webp";
  const look: ProjectionLook = {
    ...FALLBACK_LOOK,
    background: { color: "#102030", image: background, video: null, dim: 40 },
  };
  const file = { data: new Uint8Array([1, 2, 3]), width: 1600, height: 900 };

  function galleryParts(imageBackground: "color" | "theme" | "blur") {
    const sources: ProjectionSource[] = [
      {
        kind: "images",
        key: "item",
        title: "Images",
        imageSetId: "set",
        images: [
          {
            id: "a",
            name: "Announcements",
            url,
            width: 1600,
            height: 900,
            adjust: {
              fit: "contain",
              scale: 50,
              x: 0,
              y: 0,
              rotation: 90,
              background: imageBackground,
              backgroundColor: "#000000",
            },
          },
        ],
      },
    ];
    const items = buildProjectionItems(sources, DEFAULT_ASPECT_RATIO, new Map(), () => look);
    const images = new Map([
      [url, file],
      [background, file],
    ]);
    const entries = unzip(
      projectionPptx(items, {
        title: "Sunday",
        aspectRatio: DEFAULT_ASPECT_RATIO,
        lang: "en",
        images,
      }),
    );
    const decoder = new TextDecoder();
    return new Map(
      [...entries].map(([path, data]) => [
        path,
        path.endsWith(".jpeg") ? `${data.length}` : decoder.decode(data),
      ]),
    );
  }

  it("has the image as a turned picture on its own background color", () => {
    const parts = galleryParts("color");
    const slide = parts.get("ppt/slides/slide1.xml")!;
    expect(slide).toContain('<p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill>');
    expect(slide).toContain('<a:blip r:embed="rId2"/>');
    expect(slide).toContain('<a:xfrm rot="5400000">');
    expect(slide).not.toContain('name="Dim"');
    expect(parts.get("ppt/slides/_rels/slide1.xml.rels")).toContain('Id="rId2"');
  });

  it("has the image over the background of the theme without a color of its own", () => {
    const parts = galleryParts("theme");
    const slide = parts.get("ppt/slides/slide1.xml")!;
    // The background is `rId2`, the picture `rId3`.
    expect(slide).toContain("<a:srcRect");
    expect(slide).toContain('<a:blip r:embed="rId3"/>');
    expect(slide).toContain('name="Dim"');
    expect([...parts.keys()].filter((path) => path.startsWith("ppt/media/"))).toHaveLength(2);
  });

  it("has the same image, blurred, as the background", () => {
    const parts = galleryParts("blur");
    const slide = parts.get("ppt/slides/slide1.xml")!;
    expect(slide).toMatch(
      /<p:bg><p:bgPr><a:blipFill[^>]*><a:blip r:embed="rId2"><a:blur rad="\d+"\/>/,
    );
    expect(slide).toContain('<a:blip r:embed="rId3"/>');
    // One file for the background and the picture.
    expect([...parts.keys()].filter((path) => path.startsWith("ppt/media/"))).toEqual([
      "ppt/media/image1.jpeg",
    ]);
  });
});

describe("projectionPptx with announcements", () => {
  const image = {
    id: "00000000-0000-4000-8000-0000000000bb",
    name: "Poster",
    url: "/munkater/esemenyek/fajl/kep/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-0000000000cc.webp",
    width: 1600,
    height: 900,
    adjust: {
      fit: "contain",
      scale: 100,
      x: 0,
      y: 0,
      rotation: 0,
      background: "color",
      backgroundColor: "#000000",
    },
  } as const;
  const source: ProjectionSource = {
    kind: "announcements",
    key: "a",
    title: "Announcements",
    sections: [
      {
        id: "nextWeek",
        heading: "Next week",
        range: "Oct 25 – Nov 1",
        entries: [
          { when: "Wed, Oct 28", title: "Prayer", details: ["Hall"], accent: false },
          { when: "Sat, Oct 31", title: "Youth day", details: [], accent: true },
        ],
      },
    ],
    own: [
      {
        id: "abcd1234",
        title: "Camp",
        when: "Nov 13",
        details: [],
        imageSetId: "set",
        images: [image],
        qr: { text: "https://example.com", caption: "Register" },
        qrSide: "end",
        textFirst: false,
      },
      {
        id: "dcba4321",
        title: "Offering",
        when: null,
        details: ["For the roof"],
        imageSetId: null,
        images: [],
        qr: { text: "https://example.org", caption: null },
        qrSide: null,
        textFirst: false,
      },
    ],
  };

  function parts(look: ProjectionLook = FALLBACK_LOOK) {
    const items = buildProjectionItems([source], DEFAULT_ASPECT_RATIO, new Map(), () => look);
    const jpeg = { data: new Uint8Array([1, 2, 3]), width: 10, height: 10 };
    const images = new Map([
      [image.url, jpeg],
      ["qr:https://example.com", jpeg],
      ["qr:https://example.org", jpeg],
    ]);
    const entries = unzip(
      projectionPptx(items, {
        title: "Sunday",
        aspectRatio: DEFAULT_ASPECT_RATIO,
        lang: "en",
        images,
      }),
    );
    const decoder = new TextDecoder();
    return new Map([...entries].map(([path, data]) => [path, decoder.decode(data)]));
  }

  it("has the list, the attachment with its QR code, the text slide and the QR code", () => {
    const files = parts();
    const list = files.get("ppt/slides/slide1.xml")!;
    expect(list).toContain("<a:t>Next week</a:t>");
    expect(list).toContain("<a:t>Wed, Oct 28 · </a:t>");
    expect(list).toContain("<a:t>Hall</a:t>");
    // Without an accent color: a marker and bold.
    expect(list).toContain("<a:t>▸ </a:t>");
    const poster = files.get("ppt/slides/slide2.xml")!;
    expect(poster).toContain('<a:blip r:embed="rId2"/>');
    expect(poster).toContain('name="QR code"');
    expect(poster).toContain("<a:t>Register</a:t>");
    expect(files.get("ppt/slides/slide3.xml")).toContain("<a:t>Offering</a:t>");
    expect(files.get("ppt/slides/slide4.xml")).toContain('name="QR code"');
    expect([...files.keys()].filter((path) => path.startsWith("ppt/media/"))).toHaveLength(3);
  });

  it("has the highlighted entries in the accent color of the look", () => {
    const list = parts({ ...FALLBACK_LOOK, accentColor: "#ffcc00" }).get("ppt/slides/slide1.xml")!;
    expect(list).toContain('<a:srgbClr val="FFCC00">');
    expect(list).not.toContain("▸");
  });
});

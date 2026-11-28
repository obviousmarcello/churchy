import { escapeXml } from "@/lib/music/xml";
import { zip, type ZipEntry } from "@/lib/music/zip";
import { PROJECTION_FONTS } from "./fonts";
import { BACKGROUND_BLUR, imageBox } from "./images";
import {
  ANNOUNCEMENT_HEADER,
  announcementListSpace,
  fits,
  fitsTextSlide,
  HIGHLIGHT_SCALE,
  presentationSlides,
  scriptureTextSpace,
  SLIDE_LAYOUT,
  slideLayout,
  SMALL_FONT,
  type AnnouncementLine,
  type ProjectionItem,
  type ProjectionQr,
  type ProjectionSlide,
  type SlideLayout,
} from "./slides";
import type { ProjectionLook } from "./themes";

// The slides of a projection as a PowerPoint file, for a church that shows
// the lyrics with PowerPoint, Keynote or Google Slides. The slides are the
// same as on the screens (see `slides.ts`): the look of the projection theme
// of each item (the background, the dim, the font, the colors, the
// alignment, the shadow and a fade), and the same splits of long sections.
// PowerPoint does not make text smaller until it fits, so each text gets the
// size that the estimate of `fits` gives. PowerPoint shows a font only when
// the computer has it. An image of the gallery is a picture at the place that
// its adjustments give (see `imageBox`). A QR code is a picture on a white
// card, as on the screens.

export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** In EMU (1/914400 inch): 7.5 inches, as the PowerPoint slides of 16:9 and 4:3. */
const SLIDE_HEIGHT = 6_858_000;
/** In points. */
const SLIDE_HEIGHT_PT = 540;
/** PowerPoint accepts slides up to 56 inches wide. */
const MAX_SLIDE_WIDTH = 51_206_400;
/** The font of the master and the theme of the file. Each text has the font of its look. */
const FONT = "Arial";
/** The text size of the copyright on a title slide, as a part of the slide height. The reference under the verses has the size of the layout. */
const COPYRIGHT_FONT = SMALL_FONT;

/** A background image or an image of the gallery as a JPEG file: older PowerPoint versions cannot read WebP. */
export type PptxImage = { data: Uint8Array; width: number; height: number };

/** The key of the picture of a QR code in `ProjectionPptxOptions.images`. */
export function qrImageKey(text: string): string {
  return `qr:${text}`;
}

/** The QR code of a slide, if it has one. */
export function slideQr(slide: ProjectionSlide): ProjectionQr | null {
  if (slide.kind === "qr") return { text: slide.text, caption: slide.caption };
  return slide.kind === "image" && slide.qr ? slide.qr : null;
}

export type ProjectionPptxOptions = {
  /** The title of the file, e.g. the title of the event. */
  title: string;
  /** Width / height of the slides. */
  aspectRatio: number;
  /** The language of the text, e.g. "hu-HU". */
  lang: string;
  /**
   * The background images of the looks and the images of the gallery, by
   * their URL, and the QR codes (see `qrImageKey`). A slide without its
   * background image has the background color only, and an image slide
   * without its image has no picture.
   */
  images?: ReadonlyMap<string, PptxImage>;
  date?: Date;
};

/** The PowerPoint file (.pptx) with the slides of all items in order: the tiles, with the verses of a scripture reading together. */
export function projectionPptx(
  items: ProjectionItem[],
  options: ProjectionPptxOptions,
): Uint8Array<ArrayBuffer> {
  const width = Math.min(Math.round(SLIDE_HEIGHT * options.aspectRatio), MAX_SLIDE_WIDTH);
  // Each image once in the file, as `ppt/media/image<n>.jpeg`.
  const media = new Map<string, { number: number; image: PptxImage }>();
  /** The number of the image in the file, or undefined when the image did not load. */
  function addMedia(url: string | null): { number: number; image: PptxImage } | undefined {
    const image = url ? options.images?.get(url) : undefined;
    if (!url || !image) return undefined;
    if (!media.has(url)) media.set(url, { number: media.size + 1, image });
    return media.get(url);
  }
  const slides = presentationSlides(items, options.aspectRatio).map(({ item, slide }) => {
    // An image with its own background covers the background of the look:
    // a color, or the same image as a blurred background picture.
    const own = slide.kind === "image" && slide.adjust.background !== "theme" ? slide : null;
    const look = own
      ? {
          ...item.look,
          background: {
            color: own.adjust.background === "color" ? own.adjust.backgroundColor : "#000000",
            image: own.adjust.background === "blur" ? own.url : null,
            video: null,
            dim: 0,
          },
        }
      : item.look;
    const background = addMedia(look.background.image);
    const picture = slide.kind === "image" ? addMedia(slide.url) : undefined;
    const qr = slideQr(slide);
    const qrPicture = qr ? addMedia(qrImageKey(qr.text)) : undefined;
    // `rId1` is the layout, then the background (`rId2`), then the picture, then the QR code.
    const targets: [string, string][] = [[RT_LAYOUT, "../slideLayouts/slideLayout1.xml"]];
    if (background) targets.push([RT_IMAGE, `../media/image${background.number}.jpeg`]);
    const pictureId = picture
      ? `rId${targets.push([RT_IMAGE, `../media/image${picture.number}.jpeg`])}`
      : undefined;
    const qrId = qrPicture
      ? `rId${targets.push([RT_IMAGE, `../media/image${qrPicture.number}.jpeg`])}`
      : undefined;
    return {
      xml: slideXml(slide, look, width, options, background?.image, pictureId, qrId),
      rels: rels(targets),
    };
  });
  const date = options.date ?? new Date();

  const entries: ZipEntry[] = [
    { path: "[Content_Types].xml", data: contentTypesXml(slides.length, media.size > 0) },
    { path: "_rels/.rels", data: ROOT_RELS },
    { path: "docProps/core.xml", data: coreXml(options.title, date) },
    { path: "docProps/app.xml", data: appXml(slides.length) },
    { path: "ppt/presentation.xml", data: presentationXml(slides.length, width) },
    { path: "ppt/_rels/presentation.xml.rels", data: presentationRels(slides.length) },
    { path: "ppt/presProps.xml", data: `${XML_HEADER}<p:presentationPr ${NS}/>` },
    { path: "ppt/viewProps.xml", data: `${XML_HEADER}<p:viewPr ${NS}/>` },
    {
      path: "ppt/tableStyles.xml",
      data: `${XML_HEADER}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    },
    { path: "ppt/theme/theme1.xml", data: THEME },
    { path: "ppt/slideMasters/slideMaster1.xml", data: SLIDE_MASTER },
    {
      path: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      data: rels([
        [RT_LAYOUT, "../slideLayouts/slideLayout1.xml"],
        [RT_THEME, "../theme/theme1.xml"],
      ]),
    },
    { path: "ppt/slideLayouts/slideLayout1.xml", data: SLIDE_LAYOUT_XML },
    {
      path: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      data: rels([[RT_MASTER, "../slideMasters/slideMaster1.xml"]]),
    },
    ...slides.flatMap((slide, index): ZipEntry[] => [
      { path: `ppt/slides/slide${index + 1}.xml`, data: slide.xml },
      { path: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slide.rels },
    ]),
    ...[...media.values()].map(({ number, image }): ZipEntry => ({
      path: `ppt/media/image${number}.jpeg`,
      data: image.data,
    })),
  ];
  return zip(entries, date);
}

/**
 * The largest text size up to `layout.maxFont` at which the paragraphs fit. A
 * text that does not fit at `minFont` is one long line (see `splitSection`):
 * it gets smaller still. `space`: the height for the text (see `fits`).
 * `layout`: the layout of the look (see `slideLayout`).
 */
export function slideFont(
  paragraphs: string[][],
  aspectRatio: number,
  space?: number,
  layout: SlideLayout = SLIDE_LAYOUT,
): number {
  return largestFont(layout, (font) => fits(paragraphs, aspectRatio, font, space, layout));
}

/** The largest text size up to `layout.maxFont` at which `fitsAt` is true, down to a quarter of `minFont` (see `slideFont`). */
function largestFont(layout: SlideLayout, fitsAt: (font: number) => boolean): number {
  const smallest = layout.minFont / 4;
  for (let font = layout.maxFont; font > smallest; font *= 0.96) {
    if (fitsAt(font)) return font;
  }
  return smallest;
}

const ALIGNS: Record<ProjectionLook["textAlign"], "l" | "ctr" | "r"> = {
  left: "l",
  center: "ctr",
  right: "r",
};
const ANCHORS: Record<ProjectionLook["verticalAlign"], "t" | "ctr" | "b"> = {
  top: "t",
  center: "ctr",
  bottom: "b",
};

/** `pictureId`: the relationship of the image of an image slide. `qrId`: of its QR code. */
function slideXml(
  slide: ProjectionSlide,
  look: ProjectionLook,
  width: number,
  options: ProjectionPptxOptions,
  image?: PptxImage,
  pictureId?: string,
  qrId?: string,
): string {
  const layout = slideLayout(look);
  const padding = Math.round(layout.padding * SLIDE_HEIGHT);
  const box = {
    x: padding,
    y: padding,
    width: width - 2 * padding,
    height: SLIDE_HEIGHT - 2 * padding,
  };
  const text: TextStyle = {
    color: look.textColor.slice(1).toUpperCase(),
    typeface: escapeXml(PROJECTION_FONTS[look.font].label),
    shadow: look.textShadow,
    lang: options.lang,
  };
  const align = ALIGNS[look.textAlign];
  const anchor = ANCHORS[look.verticalAlign];
  // The black over the image, under the text.
  const shapes: string[] =
    image && look.background.dim > 0 ? [dimShape(10, width, look.background.dim)] : [];
  const fontOf = (paragraphs: string[][], space?: number) =>
    slideFont(paragraphs, options.aspectRatio, space, layout);

  if (slide.kind === "image") {
    // With a QR code: the image in 2/3 of the slide, the QR code in the other third.
    const portrait = width < SLIDE_HEIGHT;
    const area: Box = slide.qr
      ? portrait
        ? {
            x: 0,
            y: slide.qr.side === "start" ? Math.round(SLIDE_HEIGHT / 3) : 0,
            width,
            height: Math.round((SLIDE_HEIGHT * 2) / 3),
          }
        : {
            x: slide.qr.side === "start" ? Math.round(width / 3) : 0,
            y: 0,
            width: Math.round((width * 2) / 3),
            height: SLIDE_HEIGHT,
          }
      : { x: 0, y: 0, width, height: SLIDE_HEIGHT };
    if (pictureId) shapes.push(pictureShape(2, pictureId, slide, area));
    if (slide.qr) {
      const panel: Box = portrait
        ? {
            x: 0,
            y: slide.qr.side === "start" ? 0 : area.height,
            width,
            height: SLIDE_HEIGHT - area.height,
          }
        : {
            x: slide.qr.side === "start" ? 0 : area.width,
            y: 0,
            width: width - area.width,
            height: SLIDE_HEIGHT,
          };
      shapes.push(...qrCardShapes(3, panel, slide.qr, qrId, options.lang));
    }
  } else if (slide.kind === "qr") {
    const margin = Math.round(0.06 * SLIDE_HEIGHT);
    shapes.push(
      ...qrCardShapes(
        2,
        { x: margin, y: margin, width: width - 2 * margin, height: SLIDE_HEIGHT - 2 * margin },
        slide,
        qrId,
        options.lang,
      ),
    );
  } else if (slide.kind === "announcements") {
    // The heading and the days at the top, the entries in the space below.
    const headerHeight = Math.round(ANNOUNCEMENT_HEADER * SLIDE_HEIGHT);
    shapes.push(
      textShape(
        2,
        "Heading",
        { ...box, height: Math.round(headerHeight * 0.62) },
        [[slide.heading]],
        {
          ...text,
          font: 0.07,
          layout,
          bold: true,
          align,
          anchor: "t",
        },
      ),
    );
    shapes.push(
      textShape(
        3,
        "Days",
        {
          ...box,
          y: box.y + Math.round(headerHeight * 0.58),
          height: Math.round(headerHeight * 0.3),
        },
        [[slide.range]],
        {
          ...text,
          font: COPYRIGHT_FONT,
          layout,
          align,
          anchor: "t",
          alpha: 75,
        },
      ),
    );
    const space = announcementListSpace(layout);
    const listBox = { ...box, y: box.y + headerHeight, height: box.height - headerHeight };
    const font = fontOf(slide.entries.map(announcementLines), space);
    // A list: centered lines are hard to read, as on the screens.
    shapes.push(
      announcementsShape(4, listBox, slide.entries, look.accentColor, {
        ...text,
        font,
        layout,
        align: align === "ctr" ? "l" : align,
        anchor,
      }),
    );
  } else if (slide.kind === "announcement") {
    const paragraphs = [
      [slide.title],
      ...(slide.when ? [[slide.when]] : []),
      ...slide.details.map((detail) => detail.split("\n")),
    ];
    const font = fontOf(paragraphs);
    shapes.push(announcementShape(2, box, slide, { ...text, font, layout, align, anchor }));
  } else if (slide.kind === "title") {
    const copyrightLines = slide.copyright?.split("\n").filter((line) => line.trim()) ?? [];
    // The copyright at the bottom, the title in the space above it.
    const copyrightHeight = copyrightLines.length
      ? Math.round(
          (copyrightLines.length * layout.lineHeight + 0.7) * COPYRIGHT_FONT * SLIDE_HEIGHT,
        )
      : 0;
    const titleBox = { ...box, height: box.height - copyrightHeight };
    const font = fontOf([[slide.title]], titleBox.height / SLIDE_HEIGHT);
    shapes.push(
      textShape(2, "Title", titleBox, [[slide.title]], {
        ...text,
        font,
        layout,
        bold: true,
        align,
        anchor,
      }),
    );
    if (copyrightLines.length) {
      shapes.push(
        textShape(
          3,
          "Copyright",
          { ...box, y: box.y + box.height - copyrightHeight, height: copyrightHeight },
          [copyrightLines],
          {
            ...text,
            font: COPYRIGHT_FONT,
            layout,
            align,
            anchor: "b",
            alpha: 75,
          },
        ),
      );
    }
  } else if (slide.kind === "text") {
    const font = largestFont(layout, (size) =>
      fitsTextSlide(slide, options.aspectRatio, size, layout),
    );
    shapes.push(
      textSlideShape(2, box, slide, look.accentColor, { ...text, font, layout, align, anchor }),
    );
  } else if (slide.kind === "lyrics" && slide.paragraphs.length > 0) {
    const font = fontOf(slide.paragraphs);
    shapes.push(
      textShape(2, "Lyrics", box, slide.paragraphs, { ...text, font, layout, align, anchor }),
    );
  } else if (slide.kind === "scripture") {
    // The reference at the bottom, the verses in the space above it.
    const space = scriptureTextSpace(layout);
    const referenceHeight = Math.round((1 - 2 * layout.padding - space) * SLIDE_HEIGHT);
    const versesBox = { ...box, height: box.height - referenceHeight };
    const prose = slide.verses.map(({ label, text }) => `${label} ${text}`).join(" ");
    const font = fontOf([[prose]], space);
    // Prose: a centered paragraph is hard to read, as on the screens.
    shapes.push(
      versesShape(2, versesBox, slide.verses, {
        ...text,
        font,
        layout,
        align: align === "ctr" ? "l" : align,
        anchor,
      }),
    );
    shapes.push(
      textShape(
        3,
        "Reference",
        { ...box, y: box.y + box.height - referenceHeight, height: referenceHeight },
        [[slide.reference]],
        {
          ...text,
          font: layout.referenceFont,
          layout,
          align,
          anchor: "b",
          alpha: 75,
        },
      ),
    );
  }

  return (
    `${XML_HEADER}<p:sld ${NS}><p:cSld>${backgroundXml(look, width, image, slide.kind === "image" && slide.adjust.background === "blur")}<p:spTree>${GROUP_PROPERTIES}${shapes.join("")}</p:spTree></p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(look)}</p:sld>`
  );
}

/**
 * The background of a slide: the image (relationship `rId2`) covers it, or the
 * color. `blurred`: the image is blurred and a little darker, as the
 * background "blur" of an image slide.
 */
function backgroundXml(
  look: ProjectionLook,
  width: number,
  image?: PptxImage,
  blurred = false,
): string {
  const color = `<a:solidFill><a:srgbClr val="${look.background.color.slice(1).toUpperCase()}"/></a:solidFill>`;
  if (!image) return `<p:bg><p:bgPr>${color}<a:effectLst/></p:bgPr></p:bg>`;
  // "Cover": the image fills the slide, and the parts outside it are cut off. In 1/1000 of a percent.
  const imageRatio = image.width / Math.max(1, image.height);
  const slideRatio = width / SLIDE_HEIGHT;
  const cut = (visible: number) => Math.round(((1 - visible) / 2) * 100_000);
  const crop =
    imageRatio > slideRatio
      ? ` l="${cut(slideRatio / imageRatio)}" r="${cut(slideRatio / imageRatio)}"`
      : ` t="${cut(imageRatio / slideRatio)}" b="${cut(imageRatio / slideRatio)}"`;
  return (
    `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1">${blipXml("rId2", blurred)}<a:srcRect${crop}/>` +
    "<a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>"
  );
}

function blipXml(relationshipId: string, blurred: boolean): string {
  if (!blurred) return `<a:blip r:embed="${relationshipId}"/>`;
  return `<a:blip r:embed="${relationshipId}"><a:blur rad="${Math.round(BACKGROUND_BLUR * SLIDE_HEIGHT)}"/><a:lum bright="-20000"/></a:blip>`;
}

/** A fade into the slide for a look with a fade. */
function transitionXml(look: ProjectionLook): string {
  if (look.transition.kind === "cut" || look.transition.ms === 0) return "";
  const speed = look.transition.ms <= 300 ? "fast" : look.transition.ms <= 700 ? "med" : "slow";
  return `<p:transition spd="${speed}"><p:fade/></p:transition>`;
}

/**
 * The image of an image slide at the place of its adjustments in `area` of
 * the slide. Its parts outside the slide do not show in the slide show.
 */
function pictureShape(
  id: number,
  relationshipId: string,
  slide: Extract<ProjectionSlide, { kind: "image" }>,
  area: Box,
): string {
  const box = imageBox(slide.adjust, slide.width, slide.height, area.width / area.height);
  const cx = Math.max(1, Math.round(box.width * area.width));
  const cy = Math.max(1, Math.round(box.height * area.height));
  const x = Math.round(area.x + box.centerX * area.width - cx / 2);
  const y = Math.round(area.y + box.centerY * area.height - cy / 2);
  // In 1/60000 of a degree, clockwise. The picture turns around its center.
  const rotation = box.rotation ? ` rot="${box.rotation * 60_000}"` : "";
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Image"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm${rotation}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  );
}

/**
 * A QR code with its caption on a white card in the middle of `panel`, as on
 * the screens. Without its picture (`relationshipId`), the card has its text.
 */
function qrCardShapes(
  id: number,
  panel: Box,
  qr: ProjectionQr,
  relationshipId: string | undefined,
  lang: string,
): string[] {
  const pad = Math.round(0.025 * SLIDE_HEIGHT);
  const captionHeight = qr.caption ? Math.round(0.12 * SLIDE_HEIGHT) : 0;
  const code = Math.max(
    1,
    Math.min(panel.width * 0.8 - 2 * pad, panel.height * 0.85 - 2 * pad - captionHeight),
  );
  const cardWidth = Math.round(code + 2 * pad);
  const cardHeight = Math.round(code + 2 * pad + captionHeight);
  const card = {
    x: Math.round(panel.x + (panel.width - cardWidth) / 2),
    y: Math.round(panel.y + (panel.height - cardHeight) / 2),
    width: cardWidth,
    height: cardHeight,
  };
  const black: TextStyle = { color: "000000", typeface: FONT, shadow: "none", lang };
  const shapes = [
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="QR card"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${card.x}" y="${card.y}"/><a:ext cx="${card.width}" cy="${card.height}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`,
  ];
  const codeBox = {
    x: card.x + pad,
    y: card.y + pad,
    width: Math.round(code),
    height: Math.round(code),
  };
  shapes.push(
    relationshipId
      ? `<p:pic><p:nvPicPr><p:cNvPr id="${id + 1}" name="QR code" descr="${escapeXml(qr.text)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
          `<p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
          `<p:spPr><a:xfrm><a:off x="${codeBox.x}" y="${codeBox.y}"/><a:ext cx="${codeBox.width}" cy="${codeBox.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
      : textShape(id + 1, "QR text", codeBox, [[qr.text]], {
          ...black,
          font: COPYRIGHT_FONT,
          layout: SLIDE_LAYOUT,
          align: "ctr",
          anchor: "ctr",
        }),
  );
  if (qr.caption) {
    shapes.push(
      textShape(
        id + 2,
        "Caption",
        {
          x: card.x + pad,
          y: codeBox.y + codeBox.height,
          width: card.width - 2 * pad,
          height: captionHeight,
        },
        [[qr.caption]],
        {
          ...black,
          font: 0.04,
          layout: SLIDE_LAYOUT,
          bold: true,
          align: "ctr",
          anchor: "ctr",
        },
      ),
    );
  }
  return shapes;
}

/** The lines of an entry of a list, for its text size. */
function announcementLines(entry: AnnouncementLine): string[] {
  return [
    `${entry.when}  ${entry.title}`,
    ...entry.details.flatMap((detail) => detail.split("\n")),
  ];
}

/**
 * The entries of a list of announcements: the days and time a little
 * lighter, the highlighted ones in bold and in the accent color (else with a
 * marker), their details smaller.
 */
function announcementsShape(
  id: number,
  box: Box,
  entries: AnnouncementLine[],
  accentColor: string | null,
  style: TextStyle & {
    font: number;
    layout: SlideLayout;
    align: "l" | "ctr" | "r";
    anchor: "t" | "ctr" | "b";
  },
): string {
  const points = style.font * SLIDE_HEIGHT_PT;
  const size = Math.max(100, Math.round(points * 100));
  const detailSize = Math.max(100, Math.round(points * 75));
  const lineSpacing = Math.round(points * style.layout.lineHeight * 100);
  const gap = Math.round(points * style.layout.paragraphGap * 100);
  const run = (text: string, runStyle: TextStyle & { size: number; alpha?: number }, extra = "") =>
    `<a:r>${runProperties(runStyle, extra)}<a:t>${escapeXml(text)}</a:t></a:r>`;
  const body = entries
    .map((entry, index) => {
      const color = entry.accent && accentColor ? accentColor.slice(1).toUpperCase() : style.color;
      const strong = entry.accent ? ' b="1"' : "";
      const before = index > 0 ? `<a:spcBef><a:spcPts val="${gap}"/></a:spcBef>` : "";
      const marker =
        entry.accent && !accentColor ? run("▸ ", { ...style, color, size }, strong) : "";
      const when = entry.when ? run(`${entry.when} · `, { ...style, color, size, alpha: 75 }) : "";
      const details = entry.details
        .flatMap((detail) => detail.split("\n"))
        .map(
          (line) =>
            `<a:br>${runProperties({ ...style, color, size: detailSize })}</a:br>${run(line, { ...style, color, size: detailSize, alpha: 80 })}`,
        )
        .join("");
      return `<a:p><a:pPr algn="${style.align}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc>${before}</a:pPr>${marker}${when}${run(entry.title, { ...style, color, size }, strong)}${details}</a:p>`;
    })
    .join("");
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Announcements"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${style.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

/** The own slide of an announcement: its title in bold, its days and time and its details smaller. */
function announcementShape(
  id: number,
  box: Box,
  slide: Extract<ProjectionSlide, { kind: "announcement" }>,
  style: TextStyle & {
    font: number;
    layout: SlideLayout;
    align: "l" | "ctr" | "r";
    anchor: "t" | "ctr" | "b";
  },
): string {
  const points = style.font * SLIDE_HEIGHT_PT;
  const lineSpacing = (scale: number) => Math.round(points * scale * style.layout.lineHeight * 100);
  const paragraph = (lines: string[], scale: number, extra = "", alpha?: number) => {
    const runStyle = { ...style, size: Math.max(100, Math.round(points * scale * 100)), alpha };
    const text = lines
      .map((line) => `<a:r>${runProperties(runStyle, extra)}<a:t>${escapeXml(line)}</a:t></a:r>`)
      .join(`<a:br>${runProperties(runStyle)}</a:br>`);
    const before = `<a:spcBef><a:spcPts val="${Math.round(points * scale * 0.4 * 100)}"/></a:spcBef>`;
    return `<a:p><a:pPr algn="${style.align}"><a:lnSpc><a:spcPts val="${lineSpacing(scale)}"/></a:lnSpc>${before}</a:pPr>${text}</a:p>`;
  };
  const body = [
    paragraph([slide.title], 1, ' b="1"'),
    ...(slide.when ? [paragraph([slide.when], 0.6, "", 80)] : []),
    ...slide.details.map((detail) => paragraph(detail.split("\n"), 0.5, "", 80)),
  ].join("");
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Announcement"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${style.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

/** The text of a text slide: its paragraphs, then its highlighted text larger and in bold, in the accent color. */
function textSlideShape(
  id: number,
  box: Box,
  slide: Extract<ProjectionSlide, { kind: "text" }>,
  accentColor: string | null,
  style: TextStyle & {
    font: number;
    layout: SlideLayout;
    align: "l" | "ctr" | "r";
    anchor: "t" | "ctr" | "b";
  },
): string {
  const points = style.font * SLIDE_HEIGHT_PT;
  const gap = Math.round(points * style.layout.paragraphGap * 100);
  const paragraph = (
    lines: string[],
    index: number,
    scale: number,
    extra: string,
    color: string,
  ) => {
    const run = runProperties(
      { ...style, color, size: Math.max(100, Math.round(points * scale * 100)) },
      extra,
    );
    const lineSpacing = Math.round(points * scale * style.layout.lineHeight * 100);
    const before = index > 0 ? `<a:spcBef><a:spcPts val="${gap}"/></a:spcBef>` : "";
    const text = lines
      .map((line) => `<a:r>${run}<a:t>${escapeXml(line)}</a:t></a:r>`)
      .join(`<a:br>${run}</a:br>`);
    return `<a:p><a:pPr algn="${style.align}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc>${before}</a:pPr>${text}</a:p>`;
  };
  const accent = accentColor ? accentColor.slice(1).toUpperCase() : style.color;
  const body = [
    ...slide.paragraphs.map((lines, index) => paragraph(lines, index, 1, "", style.color)),
    ...slide.highlight.map((lines, index) =>
      paragraph(lines, slide.paragraphs.length + index, HIGHLIGHT_SCALE, ' b="1"', accent),
    ),
  ].join("");
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${style.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

/** Black over the whole slide, `dim` percent opaque. */
function dimShape(id: number, width: number, dim: number): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Dim"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${SLIDE_HEIGHT}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="000000"><a:alpha val="${dim * 1000}"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
  );
}

type Box = { x: number; y: number; width: number; height: number };

type TextStyle = {
  /** E.g. "FFFFFF". */
  color: string;
  typeface: string;
  shadow: ProjectionLook["textShadow"];
  lang: string;
};

/** The properties of a run of text. */
function runProperties(style: TextStyle & { size: number; alpha?: number }, extra = ""): string {
  const alpha = style.alpha ? `<a:alpha val="${style.alpha * 1000}"/>` : "";
  const shadow =
    style.shadow === "none"
      ? ""
      : `<a:effectLst><a:outerShdw blurRad="${style.shadow === "strong" ? 76200 : 50800}" dist="${style.shadow === "strong" ? 25400 : 12700}" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="${style.shadow === "strong" ? 85000 : 60000}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
  return `<a:rPr lang="${escapeXml(style.lang)}" sz="${style.size}"${extra} dirty="0"><a:solidFill><a:srgbClr val="${style.color}">${alpha}</a:srgbClr></a:solidFill>${shadow}<a:latin typeface="${style.typeface}"/><a:cs typeface="${style.typeface}"/></a:rPr>`;
}

/** A text box with the paragraphs. The lines of a paragraph are line breaks in it. */
function textShape(
  id: number,
  name: string,
  box: Box,
  paragraphs: string[][],
  style: TextStyle & {
    font: number;
    layout: SlideLayout;
    bold?: boolean;
    align: "l" | "ctr" | "r";
    anchor: "t" | "ctr" | "b";
    alpha?: number;
  },
): string {
  const points = style.font * SLIDE_HEIGHT_PT;
  // In hundredths of a point.
  const size = Math.max(100, Math.round(points * 100));
  const lineSpacing = Math.round(points * style.layout.lineHeight * 100);
  const gap = Math.round(points * style.layout.paragraphGap * 100);
  const run = runProperties({ ...style, size }, style.bold ? ' b="1"' : "");

  const body = paragraphs
    .map((lines, index) => {
      const before = index > 0 ? `<a:spcBef><a:spcPts val="${gap}"/></a:spcBef>` : "";
      const text = lines
        .map((line) => `<a:r>${run}<a:t>${escapeXml(line)}</a:t></a:r>`)
        .join(`<a:br>${run}</a:br>`);
      return `<a:p><a:pPr algn="${style.align}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc>${before}</a:pPr>${text}</a:p>`;
    })
    .join("");

  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${style.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

/** The verses as one paragraph, with the verse numbers raised and smaller. */
function versesShape(
  id: number,
  box: Box,
  verses: { label: string; text: string }[],
  style: TextStyle & {
    font: number;
    layout: SlideLayout;
    align: "l" | "r";
    anchor: "t" | "ctr" | "b";
  },
): string {
  const points = style.font * SLIDE_HEIGHT_PT;
  const size = Math.max(100, Math.round(points * 100));
  const labelSize = Math.max(100, Math.round(points * 55));
  const lineSpacing = Math.round(points * style.layout.lineHeight * 100);
  const run = (text: string, sz: number, extra = "") =>
    `<a:r>${runProperties({ ...style, size: sz }, extra)}<a:t>${escapeXml(text)}</a:t></a:r>`;
  const runs = verses
    .map(({ label, text }, index) => {
      // A space after each verse, in the size of the text. A no-break space keeps the number with its verse.
      const after = index < verses.length - 1 ? " " : "";
      return `${run(`${label}\u00A0`, labelSize, ' baseline="30000" b="1"')}${run(`${text}${after}`, size)}`;
    })
    .join("");
  const body = `<a:p><a:pPr algn="${style.align}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc></a:pPr>${runs}</a:p>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Verses"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.width}" cy="${box.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${style.anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${body}</p:txBody></p:sp>`
  );
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;

const RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const RT_MASTER = `${RT}/slideMaster`;
const RT_LAYOUT = `${RT}/slideLayout`;
const RT_THEME = `${RT}/theme`;
const RT_SLIDE = `${RT}/slide`;
const RT_IMAGE = `${RT}/image`;

const CT = "application/vnd.openxmlformats-officedocument.presentationml";

/** The relationships of a part: rId1, rId2, … in order. */
function rels(targets: [type: string, target: string][]): string {
  const items = targets.map(
    ([type, target], index) =>
      `<Relationship Id="rId${index + 1}" Type="${type}" Target="${target}"/>`,
  );
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
}

const ROOT_RELS = rels([
  [`${RT}/officeDocument`, "ppt/presentation.xml"],
  [
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
    "docProps/core.xml",
  ],
  [`${RT}/extended-properties`, "docProps/app.xml"],
]);

function contentTypesXml(slideCount: number, hasImages: boolean): string {
  const overrides: [part: string, type: string][] = [
    ["/ppt/presentation.xml", `${CT}.presentation.main+xml`],
    ["/ppt/presProps.xml", `${CT}.presProps+xml`],
    ["/ppt/viewProps.xml", `${CT}.viewProps+xml`],
    ["/ppt/tableStyles.xml", `${CT}.tableStyles+xml`],
    ["/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"],
    ["/ppt/slideMasters/slideMaster1.xml", `${CT}.slideMaster+xml`],
    ["/ppt/slideLayouts/slideLayout1.xml", `${CT}.slideLayout+xml`],
    ...Array.from({ length: slideCount }, (_, index): [string, string] => [
      `/ppt/slides/slide${index + 1}.xml`,
      `${CT}.slide+xml`,
    ]),
    ["/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"],
    ["/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml"],
  ];
  return (
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (hasImages ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : "") +
    overrides
      .map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`)
      .join("") +
    "</Types>"
  );
}

function coreXml(title: string, date: Date): string {
  const created = date.toISOString().replace(/\.\d{3}Z$/, "Z");
  return (
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

function appXml(slideCount: number): string {
  return `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Slides>${slideCount}</Slides></Properties>`;
}

// The relationships of the presentation: the master, the theme, the properties, then the slides from rId5.
const FIRST_SLIDE_REL = 5;

function presentationRels(slideCount: number): string {
  return rels([
    [RT_MASTER, "slideMasters/slideMaster1.xml"],
    [RT_THEME, "theme/theme1.xml"],
    [`${RT}/presProps`, "presProps.xml"],
    [`${RT}/viewProps`, "viewProps.xml"],
    ...Array.from({ length: slideCount }, (_, index): [string, string] => [
      RT_SLIDE,
      `slides/slide${index + 1}.xml`,
    ]),
    [`${RT}/tableStyles`, "tableStyles.xml"],
  ]);
}

function presentationXml(slideCount: number, width: number): string {
  // The ids of the slides start at 256. The master and its layout have ids from 2^31.
  const slideIds = Array.from(
    { length: slideCount },
    (_, index) => `<p:sldId id="${256 + index}" r:id="rId${FIRST_SLIDE_REL + index}"/>`,
  ).join("");
  return (
    `${XML_HEADER}<p:presentation ${NS} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    (slideCount > 0 ? `<p:sldIdLst>${slideIds}</p:sldIdLst>` : "") +
    `<p:sldSz cx="${width}" cy="${SLIDE_HEIGHT}"/><p:notesSz cx="6858000" cy="9144000"/>` +
    "</p:presentation>"
  );
}

const GROUP_PROPERTIES =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

// The background is black, and the text is white (`tx1` is `lt1`).
const SLIDE_MASTER =
  `${XML_HEADER}<p:sldMaster ${NS}><p:cSld>` +
  '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
  `<p:spTree>${GROUP_PROPERTIES}</p:spTree></p:cSld>` +
  '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  "</p:sldMaster>";

const SLIDE_LAYOUT_XML =
  `${XML_HEADER}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP_PROPERTIES}</p:spTree></p:cSld>` +
  "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>";

const SOLID_PLACEHOLDER = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
const THEME_FONT = `<a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/>`;

const THEME =
  `${XML_HEADER}<a:theme xmlns:a="${NS_A}" name="Projection"><a:themeElements>` +
  '<a:clrScheme name="Projection">' +
  '<a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="5B9BD5"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
  "</a:clrScheme>" +
  `<a:fontScheme name="Projection"><a:majorFont>${THEME_FONT}</a:majorFont><a:minorFont>${THEME_FONT}</a:minorFont></a:fontScheme>` +
  '<a:fmtScheme name="Projection">' +
  `<a:fillStyleLst>${SOLID_PLACEHOLDER.repeat(3)}</a:fillStyleLst>` +
  `<a:lnStyleLst>${`<a:ln w="6350">${SOLID_PLACEHOLDER}</a:ln>`.repeat(3)}</a:lnStyleLst>` +
  `<a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst>` +
  `<a:bgFillStyleLst>${SOLID_PLACEHOLDER.repeat(3)}</a:bgFillStyleLst>` +
  "</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>";

// The fonts of the projection themes. Each has Hungarian accents (latin-ext).
// The app loads them only on the projection pages and the theme editor (see
// `src/app/[lang]/project/projection-fonts.ts`), as the CSS variable `cssVar`.
// Inter is the font of the app, so it is there already.
//
// `charWidth`: the average width of a character of lyrics, in em, a little
// too large, as `SLIDE_LAYOUT.charWidth`. The controller splits long sections
// with it, so it must be the same on each device: a fixed value, not a
// measure. A new font needs one: measure the average width of Hungarian
// lyrics with canvas `measureText`, and round it up by about 5%.

export const PROJECTION_FONT_IDS = [
  "inter",
  "roboto",
  "open-sans",
  "montserrat",
  "lato",
  "oswald",
  "merriweather",
  "playfair-display",
  "source-serif-4",
  "nunito",
] as const;

export type ProjectionFontId = (typeof PROJECTION_FONT_IDS)[number];

export type ProjectionFont = {
  id: ProjectionFontId;
  /** The name of the font, also for PowerPoint. */
  label: string;
  cssVar: string;
  fallback: "sans-serif" | "serif";
  charWidth: number;
};

export const PROJECTION_FONTS: Record<ProjectionFontId, ProjectionFont> = {
  inter: {
    id: "inter",
    label: "Inter",
    cssVar: "--font-inter",
    fallback: "sans-serif",
    charWidth: 0.55,
  },
  roboto: {
    id: "roboto",
    label: "Roboto",
    cssVar: "--font-projection-roboto",
    fallback: "sans-serif",
    charWidth: 0.53,
  },
  "open-sans": {
    id: "open-sans",
    label: "Open Sans",
    cssVar: "--font-projection-open-sans",
    fallback: "sans-serif",
    charWidth: 0.56,
  },
  montserrat: {
    id: "montserrat",
    label: "Montserrat",
    cssVar: "--font-projection-montserrat",
    fallback: "sans-serif",
    charWidth: 0.61,
  },
  lato: {
    id: "lato",
    label: "Lato",
    cssVar: "--font-projection-lato",
    fallback: "sans-serif",
    charWidth: 0.52,
  },
  oswald: {
    id: "oswald",
    label: "Oswald",
    cssVar: "--font-projection-oswald",
    fallback: "sans-serif",
    charWidth: 0.43,
  },
  merriweather: {
    id: "merriweather",
    label: "Merriweather",
    cssVar: "--font-projection-merriweather",
    fallback: "serif",
    charWidth: 0.59,
  },
  "playfair-display": {
    id: "playfair-display",
    label: "Playfair Display",
    cssVar: "--font-projection-playfair-display",
    fallback: "serif",
    charWidth: 0.53,
  },
  "source-serif-4": {
    id: "source-serif-4",
    label: "Source Serif 4",
    cssVar: "--font-projection-source-serif-4",
    fallback: "serif",
    charWidth: 0.51,
  },
  nunito: {
    id: "nunito",
    label: "Nunito",
    cssVar: "--font-projection-nunito",
    fallback: "sans-serif",
    charWidth: 0.54,
  },
};

/** The CSS `font-family` of the font. */
export function fontFamily(id: ProjectionFontId): string {
  const font = PROJECTION_FONTS[id];
  return `var(${font.cssVar}), ${font.fallback}`;
}

export function isProjectionFontId(value: string): value is ProjectionFontId {
  return (PROJECTION_FONT_IDS as readonly string[]).includes(value);
}

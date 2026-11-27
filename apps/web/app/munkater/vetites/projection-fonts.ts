import {
  Lato,
  Merriweather,
  Montserrat,
  Nunito,
  Open_Sans,
  Oswald,
  Playfair_Display,
  Roboto,
  Source_Serif_4,
} from "next/font/google";

// The fonts of the projection themes (see `PROJECTION_FONTS`), from this site:
// no request goes to Google. Only the pages that show slides use them, and
// the browser loads a font only when a slide uses it (`preload: false`).
// Inter is the font of the app (`src/app/[lang]/layout.tsx`). The options
// must be literals in each call.

const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-roboto",
});
const openSans = Open_Sans({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-open-sans",
});
const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-montserrat",
});
// Not a variable font: the regular and the bold weight.
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  preload: false,
  weight: ["400", "700"],
  variable: "--font-projection-lato",
});
const oswald = Oswald({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-oswald",
});
const merriweather = Merriweather({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-merriweather",
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-playfair-display",
});
const sourceSerif4 = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-source-serif-4",
});
const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  preload: false,
  variable: "--font-projection-nunito",
});

/** The class that defines the CSS variables of the fonts (see `ProjectionFont.cssVar`). */
export const projectionFontVariables = [
  roboto,
  openSans,
  montserrat,
  lato,
  oswald,
  merriweather,
  playfairDisplay,
  sourceSerif4,
  nunito,
]
  .map((font) => font.variable)
  .join(" ");

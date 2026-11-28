// Copies the files that the PDF reader (pdf.js) loads at run time to
// `public/pdfjs`: its worker, the WebAssembly image decoders, the character
// maps, the standard fonts and the color profiles. Also the library itself,
// for the PowerPoint renderer: it reads the PDF previews of some pictures
// (see `src/lib/pptx-slides.ts`). The site serves them
// itself, because the Content Security Policy allows no other sites. The
// `dev` and `build` scripts run this first. See `src/components/pdf-viewer.tsx`.

import { cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const target = "public/pdfjs";

await rm(target, { recursive: true, force: true });
// The legacy build: it also works in the browsers of the last years, e.g. an older iPad.
await cp(join(source, "legacy/build/pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
await cp(join(source, "legacy/build/pdf.min.mjs"), join(target, "pdf.min.mjs"));
for (const folder of ["wasm", "cmaps", "standard_fonts", "iccs"]) {
  await cp(join(source, folder), join(target, folder), { recursive: true });
}

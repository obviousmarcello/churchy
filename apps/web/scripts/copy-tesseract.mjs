// Copies the files that the text recognition (Tesseract.js) loads at run time
// to `public/tesseract`: its worker, the WebAssembly engine and the English
// and Hungarian language data. The site serves them itself, because the
// Content Security Policy allows no other sites. The `dev` and `build` scripts
// run this first. See `src/lib/ocr/tesseract-engine.ts`.

import { cp, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
// The engine is a dependency of Tesseract.js, not of the app: pnpm finds it only from there.
const core = dirname(
  createRequire(join(tesseract, "package.json")).resolve("tesseract.js-core/package.json"),
);
const target = "public/tesseract";

await rm(target, { recursive: true, force: true });
await cp(join(tesseract, "dist/worker.min.js"), join(target, "worker.min.js"));
// Only the LSTM engines: the app uses only the LSTM recognition (`OEM.LSTM_ONLY`).
// The worker picks one of them for the browser (SIMD or not), and the browser loads only that one.
for (const file of await readdir(core)) {
  if (/-lstm\.wasm\.js$/.test(file)) await cp(join(core, file), join(target, "core", file));
}
// The smaller, faster LSTM data ("best_int"), gzipped.
for (const language of ["eng", "hun"]) {
  const data = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  await cp(
    join(data, "4.0.0_best_int", `${language}.traineddata.gz`),
    join(target, "lang", `${language}.traineddata.gz`),
  );
}

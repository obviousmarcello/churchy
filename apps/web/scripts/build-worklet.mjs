// Bundles the scripts that the browser loads by URL, not as modules of the app:
// - the audio worklet of the metronome to `public/metronome-processor.js`
//   (Turbopack does not bundle files for `audioWorklet.addModule`).
// The `dev` and `build` scripts run this first. `--watch` rebuilds on each change.
// `--watch -- <command>` also runs the command, e.g. `next dev`, and stops
// when the command stops.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { context } from "esbuild";

const options = {
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
};

// Churchy (music merge, phase 1): the sources arrive in later phases (metronome: phase 3,
// service worker: phase 8, scope still open), so an entry is built only once its file exists.
const entries = [
  { entry: "lib/music/metronome/processor.ts", outfile: "public/metronome-processor.js" },
].filter(({ entry }) => existsSync(entry));

const contexts = await Promise.all(
  entries.map(({ entry, outfile }) => context({ ...options, entryPoints: [entry], outfile })),
);

if (process.argv.includes("--watch")) {
  // The files are ready before the command starts.
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.watch()));

  const separator = process.argv.indexOf("--");
  if (separator !== -1) {
    const [command, ...args] = process.argv.slice(separator + 1);
    const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
    child.on("exit", async (code) => {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
      process.exit(code ?? 1);
    });
  }
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}

/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DENOMINATIONS, PRESETS } from "./presets";
import { LITURGICAL_NAMES_TO_CONFIRM, renderReviewDoc } from "./review-doc";

const file = new URL("../../../docs/presets-review.md", import.meta.url);

describe("docs/presets-review.md", () => {
  const doc = renderReviewDoc();

  it("is the up-to-date rendering of the presets", () => {
    // `pnpm --filter @churchy/presets review-doc` regenerates the file.
    if (process.env["UPDATE_REVIEW_DOC"] === "1") writeFileSync(file, doc);
    expect(readFileSync(file, "utf8")).toBe(doc);
  });

  it("lists every preset with its terms, rites, service types and plan templates", () => {
    for (const d of DENOMINATIONS) {
      const p = PRESETS[d];
      expect(doc).toContain(`## ${p.name} (\`${d}\`)`);
      for (const t of Object.values(p.terminology)) expect(doc).toContain(`**${t.nom}**`);
      for (const r of p.rites) expect(doc).toContain(`**${r.forms.nom}**`);
      for (const s of p.serviceTypes) expect(doc).toContain(`**${s.forms.nom}**`);
      for (const t of p.planTemplates)
        expect(doc).toContain(`#### ${t.name} (\`${t.serviceType}\`)`);
    }
  });

  it("ends with the liturgical names to confirm", () => {
    const section = doc.slice(doc.indexOf("## Liturgical names to confirm"));
    for (const name of [
      ...LITURGICAL_NAMES_TO_CONFIRM.catholic,
      ...LITURGICAL_NAMES_TO_CONFIRM.protestant,
    ]) {
      expect(section).toContain(name);
    }
  });

  it("escapes table pipes", () => {
    expect(doc).not.toMatch(/\| [^|\n`]*[^\\]\|[^ \n]/);
  });
});

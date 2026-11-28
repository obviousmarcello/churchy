/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Denomination } from "@churchy/contracts";
import { PRESETS } from "./presets";
import type { DenominationalTermKey } from "./schema";

/**
 * PRD §5.2 terminology table, transcribed verbatim. Columns: rk, gk, ref, ev, bapt.
 * The second test checks this transcription against docs/01-PRD.md so the two cannot drift.
 */
const COLUMNS = ["rk", "gk", "ref", "ev", "bapt"] as const satisfies readonly Denomination[];

const PRD_TABLE: Record<DenominationalTermKey | "rites", readonly string[]> = {
  community: ["Plébánia", "Parókia", "Egyházközség", "Egyházközség", "Gyülekezet"],
  service: ["Szentmise", "Szent Liturgia", "Istentisztelet", "Istentisztelet", "Istentisztelet"],
  serviceSchedule: [
    "Miserend",
    "Liturgikus rend",
    "Istentiszteleti rend",
    "Istentiszteleti rend",
    "Alkalmaink",
  ],
  leadClergy: ["Plébános", "Parókus", "Lelkipásztor", "Lelkész", "Lelkipásztor"],
  office: [
    "Plébániai iroda",
    "Parókiai hivatal",
    "Lelkészi hivatal",
    "Lelkészi hivatal",
    "Gyülekezeti iroda",
  ],
  sermon: ["Homília", "Homília", "Igehirdetés", "Igehirdetés", "Igehirdetés"],
  layCouncil: [
    "Képviselő-testület",
    "Képviselő-testület",
    "Presbitérium",
    "Presbitérium",
    "Gyülekezetvezetés",
  ],
  rites: [
    "Keresztelő, Elsőáldozás, Bérmálás, Házasság, Temetés, Betegek kenete",
    "Keresztelő (krizmálással), Házasság, Temetés",
    "Keresztelő, Konfirmáció, Házasságkötés, Temetés",
    "Keresztelő, Konfirmáció, Esküvő, Temetés",
    "Bemerítés, Házasságkötés, Temetés, Gyermekbemutatás",
  ],
  support: [
    "Egyházi hozzájárulás",
    "Egyházi hozzájárulás",
    "Egyházfenntartói járulék",
    "Egyházfenntartói járulék",
    "Adomány",
  ],
  worshipTeam: [
    "Zenei szolgálat / Kórus",
    "Kántori szolgálat / Kórus",
    "Kántori szolgálat / Kórus",
    "Kántori szolgálat / Kórus",
    "Dicsőítő csapat",
  ],
  musicPlan: ["Énekrend", "Énekrend", "Énekrend", "Énekrend", "Dicsőítési terv"],
  serviceRota: [
    "Szolgálati beosztás (lektorok, ministránsok…)",
    "Szolgálati beosztás",
    "Szolgálati beosztás (presbiteri szolgálat, perselyezés…)",
    "Szolgálati beosztás",
    "Szolgálati beosztás",
  ],
};

/** Splits „Name (example, example…)” into the name and the examples. */
function splitExamples(cellText: string): { name: string; examples: string[] } {
  const m = /^(.*?) \((.*)…\)$/.exec(cellText);
  if (!m) return { name: cellText, examples: [] };
  return { name: m[1] as string, examples: (m[2] as string).split(", ") };
}

describe("PRD §5.2 terminology table", () => {
  for (const [col, denomination] of COLUMNS.entries()) {
    describe(denomination, () => {
      const preset = PRESETS[denomination];
      for (const [key, cells] of Object.entries(PRD_TABLE)) {
        const expected = cells[col] as string;
        it(`${key} = ${expected}`, () => {
          if (key === "rites") {
            expect(preset.rites.map((r) => r.forms.nom).join(", ")).toBe(expected);
            return;
          }
          const { name, examples } = splitExamples(expected);
          expect(preset.terminology[key as DenominationalTermKey].nom).toBe(name);
          // „(lektorok, ministránsok…)” = the first rota positions of the preset.
          const positions = preset.rotaPositions.map((p) => p.plural ?? p.lower);
          expect(positions.slice(0, examples.length)).toEqual(examples);
        });
      }
    });
  }

  it("the transcription above matches docs/01-PRD.md verbatim", () => {
    const prd = readFileSync(new URL("../../../docs/01-PRD.md", import.meta.url), "utf8");
    const section = prd.slice(
      prd.indexOf("### 5.2 Terminology examples"),
      prd.indexOf("## 6. Functional requirements"),
    );
    const header = section.split("\n").find((l) => l.startsWith("| Concept"));
    expect(header).toBe(
      "| Concept (internal key) | Római katolikus | Görögkatolikus | Református | Evangélikus | Baptista / szabadegyházi |",
    );
    const rows: Record<string, string[]> = {};
    for (const line of section.split("\n")) {
      const m = /^\| `(\w+)`[^|]*\|(.*)\|$/.exec(line);
      if (m) rows[m[1] as string] = (m[2] as string).split("|").map((c) => c.trim());
    }
    expect(rows).toEqual(PRD_TABLE);
  });
});

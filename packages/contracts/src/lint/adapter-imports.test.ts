/**
 * Fixture test for the D-90 lint rule: application code (apps/web, packages/ui) must not import a
 * data adapter (`@churchy/data-mock`, `@churchy/db`) directly. Runs ESLint's Node API with the
 * repository's real `eslint.config.mjs` on in-memory fixture sources.
 */
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = decodeURIComponent(new URL("../../../../", import.meta.url).pathname);

let eslint: ESLint;

async function restrictedImportMessages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message);
}

describe("no direct adapter imports from application code", () => {
  beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot });
  });

  const forbidden = [
    `import { createMockRepositories } from "@churchy/data-mock";\nexport const x = createMockRepositories;\n`,
    `import { seed } from "@churchy/data-mock/seed";\nexport const x = seed;\n`,
    `import { db } from "@churchy/db";\nexport const x = db;\n`,
    `import type { DbClient } from "@churchy/db/client";\nexport type X = DbClient;\n`,
    `import { store } from "../../packages/data-mock/src/store";\nexport const x = store;\n`,
    `export { store } from "@churchy/data-mock";\n`,
  ];

  for (const code of forbidden) {
    it(`flags: ${code.split("\n")[0]}`, async () => {
      for (const file of ["apps/web/app/page.tsx", "packages/ui/src/Button.tsx"]) {
        const messages = await restrictedImportMessages(code, file);
        expect(messages, file).toHaveLength(1);
        expect(messages[0]).toMatch(/@churchy\/contracts/);
      }
    });
  }

  it("allows contracts imports in app code", async () => {
    const code = `import { getRepositories } from "@churchy/contracts";\nexport const repos = getRepositories;\n`;
    expect(await restrictedImportMessages(code, "apps/web/app/page.tsx")).toEqual([]);
  });

  it("allows adapter imports in the composition root and outside app code", async () => {
    const code = `import "@churchy/data-mock";\n`;
    expect(await restrictedImportMessages(code, "apps/web/server/data-adapters.ts")).toEqual([]);
    expect(await restrictedImportMessages(code, "packages/data-mock/src/register.ts")).toEqual([]);
  });
}, 60_000);

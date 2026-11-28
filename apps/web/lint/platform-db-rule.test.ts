// @vitest-environment node
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "../..");
const eslint = new ESLint({ cwd: repo, overrideConfigFile: `${repo}/eslint.config.mjs` });

async function messages(code: string, file: string) {
  const [r] = await eslint.lintText(code, { filePath: `${repo}/${file}` });
  return r?.messages.filter((m) => m.ruleId === "platform/no-platform-db-import") ?? [];
}

const IMPORTS = [
  `import { resolveHost } from "@/server/platform-db";`,
  `import { createTenant } from "@/server/platform-db/create-tenant";`,
  `import { x } from "../server/platform-db";`,
  `export { resolveHost } from "@/server/platform-db";`,
  `export const load = () => import("@/server/platform-db");`,
  `import { signupChurch } from "@/server/signup";`,
];

describe("only allow-listed files may import server/platform-db", () => {
  for (const file of [
    "apps/web/server/session.ts",
    "apps/web/server/auth.ts",
    "apps/web/server/plans.ts",
    "apps/web/server/signup.ts",
    "apps/web/server/signup-actions.ts",
    "apps/web/proxy.ts",
    "apps/web/lib/host-resolution.ts",
    "apps/web/app/(platform)/konzol/page.tsx",
    "apps/web/app/(platform)/platform/webhely-epito/page.tsx",
    "apps/web/server/site-builder-run.ts",
    "apps/web/server/site-builder-admin.ts",
    "apps/web/server/jobs/site-builder-purge.ts",
  ]) {
    it(`allows ${file}`, async () => {
      for (const code of IMPORTS) expect(await messages(code, file), code).toEqual([]);
    });
  }

  for (const file of [
    "apps/web/server/site-builder/pipeline.ts",
    "apps/web/components/platform/site-builder/draft-review.tsx",
    "apps/web/server/jobs/main.ts",
    "apps/web/server/billing-admin.ts",
    "apps/web/server/repositories.ts",
    "apps/web/app/admin/page.tsx",
    "apps/web/app/(public)/page.tsx",
    "apps/web/lib/permissions/server.ts",
    "apps/web/server/music/models/songs.ts",
    "packages/ui/src/fixture.tsx",
  ]) {
    it(`forbids ${file}`, async () => {
      for (const code of IMPORTS)
        expect((await messages(code, file)).length, code).toBeGreaterThan(0);
    });
  }

  it("the platform pool package is only for server/platform-db itself", async () => {
    const code = `import { createPlatformPool } from "@churchy/db/platform";`;
    expect((await messages(code, "apps/web/server/session.ts")).length).toBeGreaterThan(0);
    expect(await messages(code, "apps/web/server/platform-db/client.ts")).toEqual([]);
  });

  it("does not disable the adapter-import restriction (D-90)", async () => {
    const [r] = await eslint.lintText(`import { createDb } from "@churchy/db";`, {
      filePath: `${repo}/apps/web/server/session.ts`,
    });
    expect(r?.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });
});

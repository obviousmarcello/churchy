// @vitest-environment node
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repo = resolve(process.cwd(), "../..");
const eslint = new ESLint({ cwd: repo, overrideConfigFile: `${repo}/eslint.config.mjs` });

async function messages(code: string, file = "apps/web/components/fixture.tsx") {
  const [r] = await eslint.lintText(code, { filePath: `${repo}/${file}` });
  return r?.messages.filter((m) => m.ruleId === "no-restricted-syntax") ?? [];
}

const bad: Record<string, string> = {
  "role comparison": `export const a = (role: string) => role === "editor";`,
  "reversed comparison": `export const a = (role: string) => "hrHandler" !== role;`,
  includes: `export const a = (r: string[]) => r.includes("owner");`,
  "role list access": `export const a = (x: { websiteRoles: string[] }) => x.websiteRoles.length;`,
  "computed role list": `export const a = (x: Record<string, string[]>) => x["workspaceRoles"];`,
  "destructured role list": `export const a = ({ orgRoles }: { orgRoles: string[] }) => orgRoles;`,
  "switch on role": `export function a(r: string) { switch (r) { case "volunteer": return 1; default: return 0; } }`,
};

describe("no ad-hoc role checks", () => {
  for (const [name, code] of Object.entries(bad)) {
    it(`fires on ${name}`, async () => {
      expect((await messages(code)).length).toBeGreaterThan(0);
    });
  }

  it("fires in packages/ui too", async () => {
    const found = await messages(bad["includes"] as string, "packages/ui/src/fixture.tsx");
    expect(found.length).toBeGreaterThan(0);
  });

  it("passes for can() usage and unrelated comparisons", async () => {
    const ok = `import { can } from "@churchy/policy";
export const a = (actor: Parameters<typeof can>[0]) => can(actor, "news.publish", { tenantId: "t" });
export const b = (kind: string) => kind === "tenant";`;
    expect(await messages(ok)).toEqual([]);
  });

  it("exempts only the session seam", async () => {
    const code = `export const a = (x: { websiteRoles: string[] }) => x.websiteRoles.includes("owner");`;
    expect(await messages(code, "apps/web/server/session.ts")).toEqual([]);
  });
});

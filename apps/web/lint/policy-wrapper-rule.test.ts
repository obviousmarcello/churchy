// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// D-05 [BE] guard: every server action and mutating route handler must be built with the policy
// wrapper (eslint.policy.mjs, rule `policy/require-policy-wrapper`). `pnpm lint` runs it in CI.

const repo = resolve(process.cwd(), "../..");
const eslint = new ESLint({ cwd: repo, overrideConfigFile: `${repo}/eslint.config.mjs` });
const RULE = "policy/require-policy-wrapper";

async function messages(code: string, file: string) {
  const [r] = await eslint.lintText(code, { filePath: `${repo}/${file}` });
  return r?.messages.filter((m) => m.ruleId === RULE) ?? [];
}

const ACTIONS = "apps/web/app/admin/fixture/actions.ts";
const ROUTE = "apps/web/app/api/fixture/route.ts";
const IMPORT = `import { withPolicy, withPolicyRoute, publicAction, demoAction } from "@/server/policy";\n`;

const unwrapped: Record<string, [string, string]> = {
  "exported async function": [`"use server";\nexport async function save() {}`, ACTIONS],
  "exported arrow": [`"use server";\nexport const save = async () => {};`, ACTIONS],
  "call of a non-wrapper": [
    `"use server";\nconst wrap = (f: () => Promise<void>) => f;\nexport const save = wrap(async () => {});`,
    ACTIONS,
  ],
  "wrapper-named function not imported from @/server/policy": [
    `"use server";\nimport { withPolicy } from "./my-policy";\nexport const save = withPolicy("news.edit", () => null, async () => {});`,
    ACTIONS,
  ],
  "default export": [`"use server";\nexport default async function save() {}`, ACTIONS],
  "re-export": [`"use server";\nasync function save() {}\nexport { save };`, ACTIONS],
  "export all": [`"use server";\nexport * from "./other";`, ACTIONS],
  "inline server action": [
    `export function Form() {\n  async function save() {\n    "use server";\n  }\n  return save;\n}`,
    "apps/web/app/admin/fixture/page.tsx",
  ],
  "route POST function": [`export async function POST() { return new Response(); }`, ROUTE],
  "route DELETE arrow": [`export const DELETE = async () => new Response();`, ROUTE],
  "route re-exported PATCH": [
    `async function PATCH() { return new Response(); }\nexport { PATCH };`,
    ROUTE,
  ],
  "publicAction outside the public site": [
    `"use server";\n${IMPORT}export const save = publicAction(async () => {});`,
    ACTIONS,
  ],
  "demoAction outside demo/dev files": [
    `"use server";\n${IMPORT}export const save = demoAction(async () => {});`,
    ACTIONS,
  ],
  "action wrapper on a route": [
    `${IMPORT}export const POST = withPolicy("news.edit", () => null, async () => new Response());`,
    ROUTE,
  ],
};

describe("policy/require-policy-wrapper (unwrapped fixtures fail)", () => {
  for (const [name, [code, file]] of Object.entries(unwrapped)) {
    it(`fails on ${name}`, async () => {
      expect((await messages(code, file)).length).toBeGreaterThan(0);
    });
  }
});

describe("policy/require-policy-wrapper (wrapped code passes)", () => {
  it("accepts withPolicy server actions and type exports", async () => {
    const code = `"use server";
${IMPORT}export type State = { ok: boolean };
export interface Input { id: string }
export const save = withPolicy("news.edit", ({ context }) => ({ tenantId: context.tenantId! }), async () => 1);
export const remove = withPolicy("news.delete", () => null, async () => 1, { conceal: true });`;
    expect(await messages(code, ACTIONS)).toEqual([]);
  });

  it("accepts an aliased import of the wrapper", async () => {
    const code = `"use server";
import { withPolicy as guarded } from "@/server/policy";
export const save = guarded("news.edit", () => null, async () => 1);`;
    expect(await messages(code, ACTIONS)).toEqual([]);
  });

  it("accepts withPolicyRoute for mutating methods and plain GET handlers", async () => {
    const code = `${IMPORT}export async function GET() { return new Response(); }
export const POST = withPolicyRoute("news.edit", () => null, async () => new Response());
export const dynamic = "force-dynamic";`;
    expect(await messages(code, ROUTE)).toEqual([]);
  });

  it("allows publicAction on the public site and demoAction in demo/dev files", async () => {
    const pub = `"use server";\n${IMPORT}export const send = publicAction(async () => {});`;
    expect(await messages(pub, "apps/web/app/(public)/kapcsolat/actions.ts")).toEqual([]);
    const demo = `"use server";\n${IMPORT}export const reset = demoAction(async () => {});`;
    expect(await messages(demo, "apps/web/server/demo-actions.ts")).toEqual([]);
    expect(await messages(demo, "apps/web/app/fejlesztes/kimeno-levelek/actions.ts")).toEqual([]);
  });

  it("ignores ordinary modules", async () => {
    expect(
      await messages(`export async function helper() {}`, "apps/web/server/helper.ts"),
    ).toEqual([]);
  });
});

/** Every file of apps/web that defines server actions or route handlers. */
function serverEntryFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "e2e") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) serverEntryFiles(path, found);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      const text = readFileSync(path, "utf8");
      if (/^route\.tsx?$/.test(name) || text.includes('"use server"')) found.push(path);
    }
  }
  return found;
}

describe("the app itself", () => {
  it("has every server action and route handler wrapped (no rule violations)", async () => {
    const files = serverEntryFiles(join(repo, "apps/web"));
    expect(files.length).toBeGreaterThan(0);
    const results = await eslint.lintFiles(files);
    const violations = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === RULE)
        .map((m) => `${r.filePath}:${m.line} ${m.message}`),
    );
    expect(violations).toEqual([]);
  });
});

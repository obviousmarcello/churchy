/**
 * Fixture tests for `i18n/no-hardcoded-text` (D-06 [UI]). They run ESLint's Node API twice:
 * with the rule alone (behaviour and allowlist) and with the repository's real `eslint.config.mjs`
 * (proof that the rule is wired for apps/web and packages/ui, and not for tests).
 */
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error plain ESM, no type declarations
import plugin from "./index.mjs";

const repoRoot = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const RULE = "i18n/no-hardcoded-text";

function makeLinter(ruleOptions: Record<string, unknown> = {}) {
  return new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.tsx", "**/*.ts"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { i18n: plugin },
        rules: { [RULE]: ["error", ruleOptions] },
      },
    ],
  });
}

async function violations(code: string, ruleOptions: Record<string, unknown> = {}) {
  const [result] = await makeLinter(ruleOptions).lintText(code, { filePath: "fixture.tsx" });
  const fatal = result!.messages.find((m) => m.fatal);
  if (fatal) throw new Error(fatal.message);
  return result!.messages.filter((m) => m.ruleId === RULE).map((m) => m.message);
}

const component = (jsx: string) => `export const C = () => (${jsx});\n`;

describe("i18n/no-hardcoded-text: reports", () => {
  const bad: Array<[string, string]> = [
    ["JSX text", `<p>Isten hozta!</p>`],
    ["JSX text with diacritics only", `<span>ő</span>`],
    ["JSX text next to an expression", `<p>Üdv, {name}</p>`],
    ["string literal child", `<p>{"Mentés"}</p>`],
    ["conditional string children", `<p>{ok ? "Igen" : "Nem"}</p>`],
    ["logical string child", `<p>{name || "Ismeretlen"}</p>`],
    ["template literal child", "<p>{`Szia ${name}`}</p>"],
    ["title prop", `<Page title="Kezdőlap" />`],
    ["aria-label", `<nav aria-label="Főmenü" />`],
    ["alt", `<img src="/a.png" alt="Templom" />`],
    ["placeholder", `<input placeholder="Keresés" />`],
    ["label prop in an expression container", `<Input label={"Név"} />`],
    ["camelCase *Label prop", `<Shell skipLinkLabel="Ugrás a tartalomra" />`],
    ["camelCase *Title prop", `<Block dialogTitle="Biztos?" />`],
    ["label key inside a data prop", `<Header nav={[{ label: "Kezdőlap", href: "/" }]} />`],
    ["nested user-facing key", `<Header nav={[{ href: "/", children: [{ label: "Rólunk" }] }]} />`],
    ["labels object", `<Header labels={{ openMenu: "Menü megnyitása" }} />`],
    ["as-cast literal", `<Page title={"Kezdőlap" as string} />`],
  ];

  for (const [name, jsx] of bad) {
    it(name, async () => {
      const messages = await violations(component(jsx));
      expect(messages.length, jsx).toBeGreaterThanOrEqual(1);
      expect(messages[0]).toMatch(/messages\/hu\.json/);
    });
  }

  it("reports one violation per string and names the text", async () => {
    const messages = await violations(
      component(`<Card title="Hírek" help="Segítség"><b>Szia</b></Card>`),
    );
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('"Hírek"');
  });

  it("flags Next.js metadata", async () => {
    const messages = await violations(
      `export const metadata = { title: "Komponenstár", robots: { index: false } };\n`,
    );
    expect(messages).toHaveLength(1);
  });

  it("truncates long text in the message", async () => {
    const long = "Ez egy nagyon hosszú, kódba égetett felhasználói szöveg, amelyet nem szabad";
    const [message] = await violations(component(`<p>${long}</p>`));
    expect(message).toContain("…");
    expect(message).not.toContain("nem szabad");
  });
});

describe("i18n/no-hardcoded-text: allowlist", () => {
  const ok: Array<[string, string]> = [
    ["message lookups", `<p>{t("title")}</p>`],
    ["expressions", `<p>{value}</p>`],
    ["punctuation-only text", `<span>·</span>`],
    ["symbols and digits", `<span>© 2026 – 15:30 / 12</span>`],
    ["whitespace", `<div>   </div>`],
    ["empty alt (decorative)", `<img src="/a.png" alt="" />`],
    ["class names", `<div className="rounded-lg border Primary" />`],
    [
      "id, href, type, role, data-*",
      `<a id="main" href="/hirek" role="link" data-testid="Home" />`,
    ],
    ["variant props", `<Button variant="primary" size="lg" />`],
    ["CSS custom property in code", `<code>--fs-1</code>`],
    ["text inside <code>", `<code>packages/ui</code>`],
    ["text inside <kbd>", `<kbd>Escape</kbd>`],
    ["technical user-facing value: css var", `<Swatch title="--c-primary" />`],
    ["technical user-facing value: url", `<Page title="https://example.org/x" />`],
    ["technical user-facing value: kebab id", `<Hero label="image-full" />`],
    ["template literal without letters", "<p>{`${a}–${b}`}</p>"],
    ["technical template literal", "<p>{`--fs-${step}`}</p>"],
    ["translated label in a data prop", `<Header nav={[{ label: t("nav.home"), href: "/" }]} />`],
    ["non user-facing keys in data props", `<Tabs items={[{ value: "Elso", id: "Masodik" }]} />`],
    ["style object", `<div style={{ fontFamily: "Georgia" }} />`],
    ["boolean and numeric props", `<Input required maxLength={10} />`],
    ["non-metadata object", `const x = { title: "Kezdőlap" };\nexport default x;`],
  ];

  for (const [name, jsx] of ok) {
    it(name, async () => {
      const code = jsx.includes("export default") ? jsx : component(jsx);
      expect(await violations(code)).toEqual([]);
    });
  }

  it("honours the allowedStrings option", async () => {
    const code = component(`<span>Churchy</span>`);
    expect(await violations(code)).toHaveLength(1);
    expect(await violations(code, { allowedStrings: ["Churchy"] })).toEqual([]);
  });

  it("honours the ignoreElements option", async () => {
    const code = component(`<Mono>Beta</Mono>`);
    expect(await violations(code)).toHaveLength(1);
    expect(await violations(code, { ignoreElements: ["Mono"] })).toEqual([]);
  });

  it("honours the attributes option", async () => {
    const code = component(`<Row heading2="Szakasz" />`);
    expect(await violations(code)).toEqual([]);
    expect(await violations(code, { attributes: ["heading2"] })).toHaveLength(1);
  });

  it("can be silenced for one line with a reason", async () => {
    const code = component(`<div>
      {/* eslint-disable-next-line i18n/no-hardcoded-text -- brand wordmark */}
      <span>Churchy</span>
    </div>`);
    expect(await violations(code)).toEqual([]);
  });
});

describe("i18n/no-hardcoded-text: wired in the repository config", () => {
  let eslint: ESLint;
  beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot });
  });

  async function repoViolations(code: string, filePath: string) {
    const [result] = await eslint.lintText(code, { filePath: `${repoRoot}${filePath}` });
    return (result?.messages ?? []).filter((m) => m.ruleId === RULE);
  }

  const fixture = `export const Page = () => <h1 title="Kezdőlap">Isten hozta!</h1>;\n`;

  it("fires in apps/web and packages/ui", async () => {
    expect(await repoViolations(fixture, "apps/web/app/fixture.tsx")).toHaveLength(2);
    expect(await repoViolations(fixture, "packages/ui/src/fixture.tsx")).toHaveLength(2);
  });

  it("does not fire in tests, e2e specs or other packages", async () => {
    expect(await repoViolations(fixture, "packages/ui/src/fixture.test.tsx")).toEqual([]);
    expect(await repoViolations(fixture, "apps/web/e2e/fixture.tsx")).toEqual([]);
    expect(await repoViolations(fixture, "packages/hu/src/fixture.tsx")).toEqual([]);
  });

  it("passes for catalog-driven markup", async () => {
    const ok = `export const Page = ({ t }: { t: (k: string) => string }) => <h1 title={t("a")}>{t("b")}</h1>;\n`;
    expect(await repoViolations(ok, "apps/web/app/fixture.tsx")).toEqual([]);
  });
});

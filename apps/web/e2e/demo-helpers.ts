import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Persona keys and their switcher labels (messages/hu.json `common.demo.personas`, rk terms). */
export const PERSONAS = {
  latogato: "Látogató",
  tulajdonos: "Tulajdonos",
  szerkeszto: "Szerkesztő",
  iroda: "Iroda",
  vezeto: "Plébános/Vezető",
  onkentes: "Önkéntes",
  zenei: "Zenei vezető",
  terem: "Teremfelelős",
  hr: "HR-felelős",
  bizalmas: "Bizalmas ügyek felelőse",
  egyhazmegyeiHr: "Egyházmegyei HR",
} as const;

export type PersonaKey = keyof typeof PERSONAS;

export const CHURCHES = {
  catholic: "Szent Tivadar Plébánia",
  reformed: "Dunaligeti Református Egyházközség",
  baptist: "Dunaligeti Baptista Gyülekezet",
  diocese: "Dunavölgyi Egyházmegye – egyházmegyei portál",
} as const;

export const BANNER_TEXT = "Bemutató — nem valós adatok";

/** Accessible name of a switcher option; the current one ends in "(jelenlegi)". */
export const optionName = (label: string) =>
  new RegExp("^" + label.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + String.raw`( \(jelenlegi\))?$`);

export const banner = (page: Page) => page.getByTestId("demo-banner");
export const personaSwitcher = (page: Page) => page.getByTestId("demo-persona-switcher");
export const contextSwitcher = (page: Page) => page.getByTestId("demo-context-switcher");

/**
 * Switches the persona through the UI and returns the number of clicks it took: open the list,
 * pick the persona (D-92 AC1: ≤ 2 clicks).
 */
export async function switchPersona(page: Page, key: PersonaKey): Promise<number> {
  const switcher = personaSwitcher(page);
  await switcher.locator("summary").click();
  await switcher.getByRole("button", { name: optionName(PERSONAS[key]) }).click();
  await expect(switcher.locator("summary")).toContainText(PERSONAS[key]);
  await expect(switcher).not.toHaveAttribute("open");
  return 2;
}

/** Switches the church or the diocese through the UI; returns the number of clicks (2). */
export async function switchContext(page: Page, name: string): Promise<number> {
  const switcher = contextSwitcher(page);
  await switcher.locator("summary").click();
  await switcher.getByRole("button", { name: optionName(name) }).click();
  await expect(switcher.locator("summary")).toContainText(name);
  await expect(switcher).not.toHaveAttribute("open");
  return 2;
}

export async function axeSeriousOrCritical(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

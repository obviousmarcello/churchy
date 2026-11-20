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
  csoportvezeto: "Csoportvezető",
  zenei: "Zenei vezető",
  terem: "Teremfelelős",
  hr: "HR-felelős",
  bizalmas: "Bizalmas ügyek felelőse",
  egyhazmegyeiHr: "Egyházmegyei HR",
  egyhazmegyeiUgyintezo: "Egyházmegyei ügyintéző",
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
/** The one demo menu (a disclosure) that holds both switchers and the reset button. */
export const demoMenu = (page: Page) => page.getByTestId("demo-menu");
export const personaSwitcher = (page: Page) => page.getByTestId("demo-persona-switcher");
export const contextSwitcher = (page: Page) => page.getByTestId("demo-context-switcher");
/** The current persona / church as shown on the menu button. */
export const currentPersona = (page: Page) => page.getByTestId("demo-current-persona");
export const currentContext = (page: Page) => page.getByTestId("demo-current-context");

/** Opens the demo menu (one click) unless it is open already. */
export async function openDemoMenu(page: Page): Promise<void> {
  const menu = demoMenu(page);
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await menu.locator("summary").click();
  }
  await expect(menu).toHaveAttribute("open", "");
}

/**
 * Switches the persona through the UI and returns the number of clicks it took: open the menu,
 * pick the persona (D-92 AC1: ≤ 2 clicks).
 */
export async function switchPersona(page: Page, key: PersonaKey): Promise<number> {
  await openDemoMenu(page);
  await personaSwitcher(page)
    .getByRole("button", { name: optionName(PERSONAS[key]) })
    .click();
  await expect(currentPersona(page)).toHaveText(PERSONAS[key]);
  await expect(demoMenu(page)).not.toHaveAttribute("open");
  return 2;
}

/** Switches the church or the diocese through the UI; returns the number of clicks (2). */
export async function switchContext(page: Page, name: string): Promise<number> {
  await openDemoMenu(page);
  await contextSwitcher(page)
    .getByRole("button", { name: optionName(name) })
    .click();
  await expect(currentContext(page)).toHaveText(name);
  await expect(demoMenu(page)).not.toHaveAttribute("open");
  return 2;
}

/** *Visszaállítás* from the demo menu (open the menu, click reset). */
export async function resetDemoData(page: Page): Promise<void> {
  await openDemoMenu(page);
  await page.getByTestId("demo-reset").click();
}

export async function axeSeriousOrCritical(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

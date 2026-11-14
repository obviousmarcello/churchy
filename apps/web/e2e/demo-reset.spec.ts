import { expect, test, type Page } from "@playwright/test";
import { PERSONAS, switchPersona, type PersonaKey } from "./demo-helpers";

/**
 * D-92 *Visszaállítás*: restores the seed data of the visitor's demo session from any persona.
 * The demo outbox and the request reference numbers make the session's data observable: a sample
 * request (a real repository write) adds two outbox messages and takes the next reference number.
 */

const OUTBOX = "/fejlesztes/kimeno-levelek";
const rows = (page: Page) => page.getByTestId("outbox-row");

async function submitSample(page: Page, expectedRows: number): Promise<string> {
  await page.getByTestId("outbox-sample").click();
  await expect(rows(page)).toHaveCount(expectedRows);
  // Newest first: the office notification carries the reference in its subject.
  const text = (await rows(page).first().textContent()) ?? "";
  const reference = /KER-\d{4}-\d{4}/.exec(text)?.[0];
  expect(reference, text).toBeTruthy();
  return reference!;
}

async function reset(page: Page) {
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("demo-reset-status")).toHaveText(
    "A bemutató adatai visszaálltak az eredeti állapotra.",
  );
}

test("reset restores the seed data: outbox and reference numbering start over", async ({
  page,
}) => {
  await page.goto(OUTBOX);
  await expect(rows(page)).toHaveCount(0);
  const first = await submitSample(page, 2);
  const second = await submitSample(page, 4);
  expect(second).not.toBe(first);

  await reset(page);
  await expect(rows(page)).toHaveCount(0);
  expect(await submitSample(page, 2)).toBe(first);
});

test("reset works from every persona", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(OUTBOX);
  for (const persona of Object.keys(PERSONAS) as PersonaKey[]) {
    await switchPersona(page, persona);
    await submitSample(page, 2);
    await reset(page);
    await expect(rows(page), persona).toHaveCount(0);
  }
});

test("each demo visitor has their own data", async ({ page, browser }) => {
  await page.goto(OUTBOX);
  await submitSample(page, 2);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(new URL(OUTBOX, page.url()).href);
  await expect(rows(otherPage)).toHaveCount(0);
  await other.close();
  await expect(rows(page)).toHaveCount(2);
});

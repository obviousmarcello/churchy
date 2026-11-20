import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OUTBOX = "/fejlesztes/kimeno-levelek";

// All tests share the server's one demo store, so they run one after another (and only in the
// desktop project, see playwright.config.ts).
test.describe.configure({ mode: "serial" });

const rows = (page: Page) => page.getByTestId("outbox-row");

async function axeSeriousOrCritical(page: Page) {
  // The sandboxed email iframe runs no scripts, so axe cannot enter it; the frame itself (title,
  // size) is part of the page and checked via its siblings.
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('[data-testid="email-preview"]')
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

// The live refresh re-renders the page (and briefly its <title>) at any moment, so a check that sees
// such a transient state is retried; a real violation fails every attempt.
async function expectNoSeriousViolations(page: Page) {
  await expect.poll(() => axeSeriousOrCritical(page), { timeout: 5000 }).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto(OUTBOX);
  await page.getByTestId("outbox-clear").click();
  await expect(page.getByTestId("outbox-count")).toHaveText("0 üzenet");
});

test("is not indexable and starts empty", async ({ page }) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1, name: "Kimenő levelek" })).toBeVisible();
  await expect(page.getByText("Még nem keletkezett kimenő üzenet.")).toBeVisible();
});

test("a mock action in another tab appears in the viewer within 1 s", async ({ page, context }) => {
  const trigger = await context.newPage();
  await trigger.goto(OUTBOX);
  await expect(rows(page)).toHaveCount(0);

  const started = Date.now();
  await trigger.getByTestId("outbox-sample").click();
  // requests.submit writes two outbox entries: the office notification and the confirmation.
  await expect(rows(page)).toHaveCount(2, { timeout: 1000 });
  const elapsed = Date.now() - started;
  expect(elapsed).toBeLessThanOrEqual(1000);

  const first = rows(page).first();
  await expect(first.getByRole("cell").first()).toHaveText(/^\d{4}\. \d{2}\. \d{2}\. \d{2}:\d{2}$/);
  await expect(page.getByTestId("outbox-count")).toHaveText("2 üzenet");
  await trigger.close();
});

test("the email preview is the real template with the reference and none of the submitted content", async ({
  page,
}) => {
  await page.getByTestId("outbox-sample").click();
  await expect(rows(page)).toHaveCount(2);

  for (const template of ["request.officeNotification", "request.confirmation"]) {
    await page.locator(`[data-template="${template}"] a`).click();
    const detail = page.getByTestId("outbox-detail");
    await expect(detail).toBeVisible();

    const frame = page.getByTestId("email-preview");
    await expect(frame).toHaveAttribute("sandbox", "");
    await expect(frame).toHaveAttribute("title", "A kimenő e-mail tartalma");
    const body = page.frameLocator('[data-testid="email-preview"]').locator("body");
    await expect(body).toContainText(/KER-\d{4}-\d{4}/);
    await expect(body).toContainText("Lelkipásztori kérelem");
    await expect(body).toContainText("Hivatkozási szám");

    const html = (await frame.getAttribute("srcdoc")) ?? "";
    const text = (await page.getByTestId("email-plain-text").textContent()) ?? "";
    for (const secret of ["Minta Mária", "minta.maria", "kitalált kérelem", "dev-minta"]) {
      expect(html, secret).not.toContain(secret);
      expect(text, secret).not.toContain(secret);
      await expect(detail).not.toContainText(secret);
    }
  }
});

test("filters by channel and by recipient", async ({ page }) => {
  await page.getByTestId("outbox-sample").click();
  await expect(rows(page)).toHaveCount(2);

  await page.getByLabel("Csatorna").selectOption("push");
  await page.getByRole("button", { name: "Szűrés" }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("A szűrőnek egyetlen üzenet sem felel meg.")).toBeVisible();

  await page.getByLabel("Csatorna").selectOption("email");
  await page.getByLabel("Címzett").selectOption({ label: "Plébániai iroda" });
  await page.getByRole("button", { name: "Szűrés" }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Plébániai iroda");
  await expect(rows(page).first()).toContainText("E-mail");

  await page.getByRole("link", { name: "Szűrők törlése" }).click();
  await expect(rows(page)).toHaveCount(2);
});

test("Kiürítés empties the outbox", async ({ page }) => {
  await page.getByTestId("outbox-sample").click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByTestId("outbox-clear").click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("outbox-count")).toHaveText("0 üzenet");
});

test("axe: 0 serious/critical violations (empty, with a list, with an open email)", async ({
  page,
}) => {
  await expectNoSeriousViolations(page);

  await page.getByTestId("outbox-sample").click();
  await expect(rows(page)).toHaveCount(2);
  await expectNoSeriousViolations(page);

  await rows(page).first().getByRole("link").click();
  await expect(page.getByTestId("email-preview")).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.setViewportSize({ width: 360, height: 800 });
  await expectNoSeriousViolations(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

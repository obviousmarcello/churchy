import { expect, test } from "@playwright/test";

/**
 * Runs against a second `next start` of the same build with `HIDE_DEV_ROUTES=1` (see
 * playwright.config.ts): every `/fejlesztes/*` route is a 404 there, the rest of the site is not.
 */
const HIDDEN = `http://localhost:${process.env.HIDDEN_PORT ?? 3101}`;

test.describe("HIDE_DEV_ROUTES=1", () => {
  for (const path of [
    "/fejlesztes/kimeno-levelek",
    "/fejlesztes/kimeno-levelek/revizio",
    "/fejlesztes/komponensek",
  ]) {
    test(`${path} returns 404`, async ({ request }) => {
      const response = await request.get(`${HIDDEN}${path}`);
      expect(response.status()).toBe(404);
    });
  }

  test("the rest of the site is unaffected", async ({ request }) => {
    const response = await request.get(`${HIDDEN}/`);
    expect(response.status()).toBe(200);
  });
});

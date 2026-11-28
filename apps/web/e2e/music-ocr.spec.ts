import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona } from "./demo-helpers";

// Music merge phase 7a (OCR): "Beolvasás képről" on the song form reads a picture on the device
// (Tesseract.js, Hungarian data only, files from /tesseract). The picture is drawn in the page.

async function dropPicture(page: Page, text: string) {
  await page.evaluate(async (line) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 240;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    context.font = "56px sans-serif";
    context.fillText(line, 40, 130);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "kotta.png", { type: "image/png" }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
}

test.describe("Kotta beolvasása (OCR)", () => {
  test("reads a picture into the chart on the new song page", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await switchPersona(page, "zenei");
    await page.goto("/munkater/enektar/uj");
    await page.getByRole("button", { name: "Beolvasás képről" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Az akkordlap beolvasása képekről")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);

    await dropPicture(page, "Áldjad lelkem az Urat");
    await dialog.getByRole("button", { name: "A szöveg beolvasása" }).click();
    await expect(dialog.getByText("Akkordlap a képekről")).toBeVisible({ timeout: 150_000 });
    await expect(dialog.getByRole("textbox")).toHaveValue(/lelkem/i);
    await dialog.getByRole("button", { name: "Beillesztés az akkordlapba" }).click();
    await expect(page.locator('[name="chordpro"]')).toHaveValue(/lelkem/i);
    await expect(page.getByText("Mentés előtt ellenőrizd.")).toBeVisible();
  });
});

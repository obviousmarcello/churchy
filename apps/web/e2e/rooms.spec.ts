import { expect, test, type Page } from "@playwright/test";
import { axeSeriousOrCritical, switchPersona, type PersonaKey } from "./demo-helpers";

async function as(page: Page, persona: PersonaKey, path: string) {
  await page.goto("/");
  await switchPersona(page, persona);
  await page.goto(path);
}

/**
 * A civil date 70 days after the demo clock's today (read from the form's default date), and a
 * Sunday or not, as asked. The demo clock is not the machine's.
 */
async function futureDate(page: Page, sunday = false): Promise<string> {
  await page.goto("/munkater/foglalas/uj");
  const today = await page.getByLabel("Dátum").inputValue();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 70);
  while ((d.getUTCDay() === 0) !== sunday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe("Teremfoglalás (D-60)", () => {
  test("board, catalog and axe", async ({ page }) => {
    await as(page, "terem", "/munkater/foglalas");
    await expect(page.getByTestId("rooms-board")).toBeVisible();
    await expect(page.getByTestId("board-room").first()).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("rooms-tabs").getByRole("link", { name: "Termek" }).click();
    await expect(page.getByTestId("catalog-room").first()).toContainText("fő");
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    // The room manager approves: the tab is there.
    await expect(page.locator('[data-tab="approvals"]')).toHaveCount(1);
  });

  test("a volunteer has no room booking", async ({ page }) => {
    await as(page, "onkentes", "/munkater/foglalas");
    await expect(page.getByTestId("rooms-board")).toHaveCount(0);
  });

  test("book, conflict with alternatives, approval, my bookings", async ({ page }) => {
    await as(page, "iroda", "/munkater/foglalas/uj");
    const date = await futureDate(page);
    await page.goto(`/munkater/foglalas/uj?datum=${date}`);
    await page
      .getByLabel("Terem", { exact: true })
      .selectOption({ label: "Plébániai nagyterem (80 fő)" });
    await page.getByLabel("Kezdés").fill("10:00");
    await page.getByLabel("Befejezés").fill("11:00");
    await page.getByLabel("Cím", { exact: true }).fill("Szülői est");
    await expect(page.getByTestId("booking-free")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-saved")).toBeVisible();
    await expect(page.getByTestId("my-booking").filter({ hasText: "Szülői est" })).toContainText(
      "Jóváhagyásra vár",
    );

    // The same slot again: clash with the first booking, with alternatives; no submit.
    await page.goto(`/munkater/foglalas/uj?datum=${date}`);
    await page
      .getByLabel("Terem", { exact: true })
      .selectOption({ label: "Plébániai nagyterem (80 fő)" });
    await page.getByLabel("Kezdés").fill("10:30");
    await page.getByLabel("Befejezés").fill("11:30");
    await page.getByLabel("Cím", { exact: true }).fill("Másik");
    await expect(page.getByTestId("booking-clash")).toContainText("Szülői est");
    await expect(page.getByTestId("booking-alternatives")).toBeVisible();
    await expect(page.getByTestId("booking-submit")).toBeDisabled();

    // The room manager approves the request.
    await switchPersona(page, "terem");
    await page.goto("/munkater/foglalas/jovahagyas");
    const row = page.getByTestId("pending-booking").filter({ hasText: "Szülői est" });
    await expect(row).toBeVisible();
    await row.getByTestId("approve").click();
    await expect(row).toHaveCount(0);
  });

  test("rules are enforced live", async ({ page }) => {
    await as(page, "iroda", "/munkater/foglalas/uj");
    await page.goto(`/munkater/foglalas/uj?datum=${await futureDate(page)}`);
    await page
      .getByLabel("Terem", { exact: true })
      .selectOption({ label: "Plébániai nagyterem (80 fő)" });
    await page.getByLabel("Kezdés").fill("08:00");
    await page.getByLabel("Befejezés").fill("15:00");
    await page.getByLabel("Cím", { exact: true }).fill("Túl hosszú");
    await expect(page.getByTestId("booking-check")).toContainText("legfeljebb 360 percig");
    await expect(page.getByTestId("booking-submit")).toBeDisabled();
  });
});

test.describe("Ismétlődő foglalás és szolgálati blokk (D-61)", () => {
  test("a weekly series reports clashes per occurrence and skips them", async ({ page }) => {
    await as(page, "vezeto", "/munkater/foglalas/uj");
    const date = await futureDate(page);
    await page.goto(`/munkater/foglalas/uj?datum=${date}`);
    const room = page.getByLabel("Terem", { exact: true });
    await room.selectOption({ label: "Plébániai nagyterem (80 fő)" });
    await page.getByLabel("Kezdés").fill("14:00");
    await page.getByLabel("Befejezés").fill("15:00");
    await page.getByLabel("Cím", { exact: true }).fill("Egyszeri");
    await expect(page.getByTestId("booking-free")).toBeVisible();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-saved")).toBeVisible();

    await page.goto(`/munkater/foglalas/uj?datum=${date}`);
    await room.selectOption({ label: "Plébániai nagyterem (80 fő)" });
    await page.getByLabel("Kezdés").fill("14:00");
    await page.getByLabel("Befejezés").fill("15:00");
    await page.getByLabel("Cím", { exact: true }).fill("Hetente");
    await page.getByLabel("Ismétlés").selectOption("weekly");
    const until = new Date(`${date}T12:00:00Z`);
    until.setUTCDate(until.getUTCDate() + 28);
    await page.getByLabel("Utolsó nap").fill(until.toISOString().slice(0, 10));
    await expect(page.getByTestId("series-summary")).toContainText(/alkalomból 1 ütközik/);
    await expect(page.getByTestId("booking-submit")).toBeDisabled();
    await page.getByTestId("skip-conflicts").check();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-saved")).toContainText("kihagyva");
    await expect(page.getByTestId("my-booking").filter({ hasText: "Hetente" })).toContainText(
      "alkalom",
    );
  });

  test("a service blocks its room, computed from the schedule", async ({ page }) => {
    await as(page, "iroda", "/munkater/foglalas/uj");
    const sunday = await futureDate(page, true);
    await page.goto(`/munkater/foglalas?datum=${sunday}`);
    const church = page.locator('[data-testid="board-room"]', { hasText: "Templomtér" });
    await expect(church.getByTestId("room-busy")).toContainText("Szolgálat");
    const text = (await church.getByTestId("room-busy").first().innerText()) ?? "";
    const start = /(\d{2}:\d{2})\s*[–-]/.exec(text)?.[1] ?? "10:00";
    const roomId = await church.getAttribute("data-room");
    await page.goto(`/munkater/foglalas/uj?terem=${roomId}&datum=${sunday}`);
    await page.getByLabel("Kezdés").fill(start);
    await page
      .getByLabel("Befejezés")
      .fill(`${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:${start.slice(3)}`);
    await page.getByLabel("Cím", { exact: true }).fill("Próba");
    await expect(page.getByTestId("booking-clash")).toContainText("szolgálat");
    await expect(page.getByTestId("booking-submit")).toBeDisabled();
  });
});

test.describe("Terem-katalógus admin", () => {
  test("rooms, service blocks and axe", async ({ page }) => {
    await as(page, "tulajdonos", "/admin/termek");
    await expect(page.getByTestId("room-row").first()).toBeVisible();
    await expect(page.getByTestId("service-blocks")).toBeVisible();
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await page.getByRole("link", { name: "Új terem" }).click();
    await page.getByLabel("Név", { exact: true }).fill("Próbaterem");
    await page.getByLabel("Befogadóképesség (fő)").fill("12");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await expect(page).toHaveURL(/\/admin\/termek\/.+mentve=1/);
    await page.goto("/admin/termek");
    await expect(page.getByTestId("rooms-list")).toContainText("Próbaterem");
  });
});

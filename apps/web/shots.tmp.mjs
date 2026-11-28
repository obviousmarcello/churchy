import { chromium } from "@playwright/test";
const [, , tag, port, ...only] = process.argv;
const out = "/home/user/churchy/.claude/worktrees/restyle-munkater/restyle-shots";
const routes = {
  shell: ["/munkater"],
  naptar: ["/munkater/naptar", "/munkater/naptar/het", "/munkater/naptar/uj"],
  foglalas: [
    "/munkater/foglalas",
    "/munkater/foglalas/termek",
    "/munkater/foglalas/jovahagyas",
    "/munkater/foglalas/enyim",
  ],
  liturgia: ["/munkater/liturgia", "/munkater/liturgia/sablonok", "/munkater/csapatok"],
  hr: ["/munkater/tavollet", "/munkater/hr", "/munkater/hr/uj", "/munkater/nevjegyzek"],
  misc: ["/munkater/esemenyek", "/munkater/ertesitesek"],
  music: [
    "/munkater/enektar",
    "/munkater/kotta",
    "/munkater/proba",
    "/munkater/vetites",
    "/munkater/vetitesi-temak",
    "/munkater/biblia-szoveg",
    "/munkater/enektar/uj",
    "/munkater/esemenyek/uj",
    "/munkater/biblia-forditasok",
    "/munkater/enektar/jogok",
    "/munkater/kepzesek",
    "/munkater/keverpult",
  ],
};
routes.dyn = [];
const browser = await chromium.launch();
for (const [vp, w, h] of [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/munkater`);
  const menu = page.getByTestId("demo-menu");
  await menu.locator("summary").click();
  await page
    .getByTestId("demo-persona-switcher")
    .getByRole("button", { name: new RegExp("^" + (process.env.PERSONA || "Tulajdonos")) })
    .click();
  await page.waitForTimeout(500);
  const dyn = [];
  for (const base of [
    "/munkater/enektar",
    "/munkater/esemenyek",
    "/munkater/kepzesek",
    "/munkater/liturgia",
    "/munkater/hr",
    "/munkater/csapatok",
    "/munkater/proba",
    "/munkater/kotta",
  ]) {
    await page.goto(`http://localhost:${port}${base}`, { waitUntil: "networkidle" });
    const hrefs = await page.$$eval(`a[href^="${base}/"]`, (as) =>
      [...new Set(as.map((a) => a.getAttribute("href")))]
        .filter((h) => !/\/(uj|sablonok|naptar|jogok|jogi|csoportok|hirdetesek)/.test(h))
        .slice(0, 1),
    );
    dyn.push(...hrefs);
  }
  routes.dyn = dyn;
  if (vp === "desktop") console.log("DYN", dyn.join(" "));
  for (const [area, list] of Object.entries(routes)) {
    if (only.length && !only.includes(area)) continue;
    for (const r of list) {
      try {
        await page.goto(`http://localhost:${port}${r}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);
        const ov = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        const name = r.replace(/\//g, "_").replace(/^_munkater_?/, "") || "home";
        await page.screenshot({ path: `${out}/${tag}/${area}-${name}-${vp}.png`, fullPage: true });
        if (ov > 0) console.log("OVERFLOW", vp, r, ov);
      } catch (e) {
        console.log("ERR", r, String(e).slice(0, 80));
      }
    }
  }
  await ctx.close();
}
await browser.close();

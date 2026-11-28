import type { FetchResult } from "./fetcher";
import type { LlmPlan } from "./plan-schema";

/**
 * A fictitious church website for tests, demo mode and e2e: "Mintavárosi Szent Példa Plébánia".
 * Every name, address, e-mail and phone number is invented (documentation-style example.hu domain);
 * the pages deliberately contain private-person data and sensitive paragraphs the pipeline must drop.
 */

export const FIXTURE_ORIGIN = "https://plebania.example.hu";

const page = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>
<header><nav><a href="/">Főoldal</a> <a href="/rolunk">Rólunk</a> <a href="/miserend">Miserend</a> <a href="/hirek">Hírek</a> <a href="/kapcsolat">Kapcsolat</a> <a href="/admin/login">Belépés</a></nav></header>
<main>${body}</main>
<footer>Mintaváros, 1234 Mintaváros, Példa utca 5. | iroda@plebania.example.hu | +36 30 000 0001</footer>
</body></html>`;

const lorem =
  "A mintavárosi közösség a város központjában működik, és minden héten sok családot, fiatalt és időset vár szeretettel a templomba és a közösségi házba.";

export const FIXTURE_PAGES: Readonly<Record<string, string>> = {
  "/": page(
    "Mintavárosi Szent Példa Plébánia",
    `<h1>Mintavárosi Szent Példa Plébánia</h1><p>${lorem}</p><img src="/img/templom.jpg" alt="A templom" width="800" height="600"><img src="https://cdn.example.com/kep.jpg" alt="Külső kép" width="400" height="300"><img src="/img/logo.png" alt="Plébánia logó" width="200" height="200">`,
    `<meta name="theme-color" content="#7a1f2b"><meta property="og:image" content="/img/hero.jpg"><meta property="og:site_name" content="Szent Példa Plébánia"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Church","name":"Mintavárosi Szent Példa Plébánia","email":"iroda@plebania.example.hu","telephone":"+36 30 000 0001"}</script>`,
  ),
  "/rolunk": page(
    "Rólunk",
    `<h1>Rólunk</h1><p>${lorem} Plébániánk plébánosa és a hitoktatók várják a szentmisékre, a hittan órákra és a közösségi alkalmakra.</p><h2>Közösségeink</h2><p>Van gyerekcsoportunk, ifjúsági és családos közösségünk is, ahol minden korosztály megtalálja a helyét a szentmisék és a programok mellett.</p><p>Kérjük imádkozzatok súlyosan beteg testvérünkért, aki kórházban fekszik és műtét előtt áll.</p><p>Magánkérdés esetén írj Példa Pál plébánosnak: pal.pelda@gmail.example.com vagy hívd a +36 20 555 0123 számot.</p><h2>Névsor</h2><p>Kovács Anna, Nagy Béla, Szabó Cecília</p><h2>Történet</h2><p>A templomot 1900-ban szentelték fel, és azóta a közösség szíve a városban; a plébánia mintaépülete 1930-ban készült el.</p><img src="/img/csoport.jpg" alt="Gyerekcsoport" width="640" height="480">`,
  ),
  "/miserend": page(
    "Miserend",
    `<h1>Miserend</h1><table><tr><td>Vasárnap</td><td>10:00</td><td>szentmise</td></tr><tr><td>Hétfő</td><td>18:30</td><td>szentmise</td></tr></table><p>Gyóntatás vasárnap 9:30-tól a templomban.</p>`,
  ),
  "/hirek": page(
    "Hírek",
    `<h1>Hírek</h1><ul><li><a href="/hirek/majus-1">Májusi ünnep</a></li></ul>`,
  ),
  "/hirek/majus-1": page(
    "Májusi ünnep",
    `<h1>Májusi ünnep</h1><time datetime="2026-05-01">2026. május 1.</time><p>Május elsején közös ünnepet tartunk a templomkertben, ahová minden családot szeretettel várunk, süteményt és játékokat is hozunk.</p>`,
  ),
  "/kapcsolat": page(
    "Kapcsolat",
    `<h1>Kapcsolat</h1><p>Iroda: 1234 Mintaváros, Példa utca 5. Telefon (iroda): +36 30 000 0001, e-mail: iroda@plebania.example.hu. Ügyfélfogadás hétfőn 9:00-11:00.</p>`,
  ),
  "/admin/login": page("Belépés", `<h1>Belépés</h1><p>Csak szerkesztőknek.</p>`),
  "/titkos/oldal": page(
    "Titkos",
    `<h1>Titkos</h1><p>Ezt a robots.txt tiltja, így nem szabad letölteni.</p>`,
  ),
};

export const FIXTURE_ROBOTS = "User-agent: *\nDisallow: /titkos\n";

/** An in-memory transport (no network, no loopback) serving the fixture site and tiny images. */
export function fixtureTransport(
  origin: string = FIXTURE_ORIGIN,
  pages: Readonly<Record<string, string>> = FIXTURE_PAGES,
  robots: string = FIXTURE_ROBOTS,
  seen: string[] = [],
): (url: string) => Promise<FetchResult> {
  return async (input) => {
    const url = new URL(input);
    seen.push(url.pathname);
    const ok = (body: string | Buffer, contentType: string): FetchResult => ({
      ok: true,
      url: url.href,
      status: 200,
      contentType,
      body: Buffer.from(body),
      redirects: [],
    });
    if (url.origin !== origin) return { ok: false, code: "off_scope", url: input };
    if (url.pathname === "/robots.txt") return ok(robots, "text/plain");
    if (url.pathname.startsWith("/img/"))
      return ok(Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png");
    const html = pages[url.pathname];
    return html !== undefined
      ? ok(html, "text/html; charset=utf-8")
      : { ok: false, code: "bad_status", url: input, status: 404 };
  };
}

const u = (p: string) => `${FIXTURE_ORIGIN}${p}`;

/** The plan a (fake) model returns for the fixture church: demo mode, tests and e2e. */
export const fixturePlan = (): LlmPlan => ({
  church: {
    name: "Mintavárosi Szent Példa Plébánia",
    shortName: "Szent Példa",
    nameSourceUrl: u("/"),
    denomination: "rk",
    denominationConfidence: 0.9,
    tagline: "Gyere el, szeretettel várunk.",
    welcome: "Örülünk, hogy itt vagy. Nézd meg a miserendet, és gyere el közénk.",
  },
  locations: [
    {
      name: "Szent Példa templom",
      kind: "templom",
      postalCode: "1234",
      city: "Mintaváros",
      line1: "Példa utca 5.",
      sourceUrl: u("/kapcsolat"),
      confidence: 0.9,
    },
  ],
  serviceTimes: [
    {
      label: "Szentmise",
      weekday: 7,
      time: "10:00",
      locationName: "Szent Példa templom",
      sourceUrl: u("/miserend"),
      confidence: 0.95,
    },
    {
      label: "Szentmise",
      weekday: 1,
      time: "18:30",
      locationName: "Szent Példa templom",
      sourceUrl: u("/miserend"),
      confidence: 0.95,
    },
    // hallucinated: not on the page
    {
      label: "Szentmise",
      weekday: 3,
      time: "19:00",
      locationName: "",
      sourceUrl: u("/miserend"),
      confidence: 0.9,
    },
  ],
  pages: [
    { url: u("/"), role: "home", title: "Főoldal", slug: "fooldal", riteKey: "" },
    { url: u("/rolunk"), role: "about", title: "Rólunk", slug: "rolunk", riteKey: "" },
    { url: u("/miserend"), role: "schedule", title: "Miserend", slug: "miserend", riteKey: "" },
    { url: u("/hirek"), role: "news_index", title: "Hírek", slug: "hirek", riteKey: "" },
    {
      url: u("/hirek/majus-1"),
      role: "news_article",
      title: "Májusi ünnep",
      slug: "majusi-unnep",
      riteKey: "",
    },
    { url: u("/kapcsolat"), role: "contact", title: "Kapcsolat", slug: "kapcsolat", riteKey: "" },
    // not crawled: must be dropped
    {
      url: "https://evil.example.com/x",
      role: "about",
      title: "Idegen",
      slug: "idegen",
      riteKey: "",
    },
  ],
  posts: [
    {
      url: u("/hirek/majus-1"),
      title: "Májusi ünnep",
      lead: "Közös ünnep a templomkertben.",
      publishedAt: "",
    },
  ],
  announcements: [],
  notes: [],
});

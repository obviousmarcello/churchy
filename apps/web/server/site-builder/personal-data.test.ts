// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ExtractedPage, TextBlock } from "./extract";
import { isOfficeEmail, officeContactsOf, scrubBlocks, scrubText } from "./personal-data";

const page = (blocks: TextBlock[], extra: Partial<ExtractedPage> = {}): ExtractedPage => ({
  url: "https://x.example.hu/",
  title: "t",
  description: null,
  lang: "hu",
  siteName: null,
  themeColor: null,
  publishedAt: null,
  blocks,
  links: [],
  images: [],
  jsonLd: [],
  emails: [],
  phones: [],
  addresses: [],
  schedule: [],
  noindex: false,
  ...extra,
});

describe("personal data", () => {
  it("tells office mailboxes from personal ones", () => {
    expect(isOfficeEmail("iroda@x.hu")).toBe(true);
    expect(isOfficeEmail("Plébánia@x.hu")).toBe(true);
    expect(isOfficeEmail("kovacs.janos@x.hu")).toBe(false);
  });

  it("learns office contacts from structured data and labelled lines", () => {
    const office = officeContactsOf([
      page(
        [
          { type: "paragraph", text: "Plébánia iroda: +36 30 111 2222" },
          { type: "paragraph", text: "Kovács atya: +36 20 333 4444" },
        ],
        {
          emails: ["info@x.hu", "kovacs.janos@x.hu"],
          jsonLd: [
            { "@type": "Church", email: "mailto:Titkarsag@X.hu", telephone: "+36 1 555 0000" },
          ],
        },
      ),
    ]);
    expect(office.emails.has("info@x.hu")).toBe(true);
    expect(office.emails.has("titkarsag@x.hu")).toBe(true);
    expect(office.emails.has("kovacs.janos@x.hu")).toBe(false);
    expect(scrubText("hívd: +36 20 333 4444", office).text).not.toContain("333");
    expect(scrubText("iroda: +36 30 111 2222", office).text).toContain("111 2222");
    expect(scrubText("+36 (30) 111-2222", office).text).toContain("111");
  });

  it("removes personal e-mails and phones, keeps office ones", () => {
    const office = officeContactsOf([page([], { emails: ["iroda@x.hu"] })]);
    const r = scrubText(
      "Írj: ferenc.nagy@gmail.example.com vagy iroda@x.hu, +36 30 999 8888.",
      office,
    );
    expect(r.text).toContain("iroda@x.hu");
    expect(r.text).not.toMatch(/ferenc|999/);
    expect(r.removed).toBe(2);
  });

  it("drops health and bereavement paragraphs but keeps rite information", () => {
    const { blocks, stats } = scrubBlocks(
      [
        {
          type: "paragraph",
          text: "Imádkozzunk súlyosan beteg testvérünkért, aki műtét előtt áll.",
        },
        { type: "paragraph", text: "Elhunyt Példa Mária, temetése pénteken lesz." },
        {
          type: "paragraph",
          text: "A temetés ügyintézéséhez keresd az irodát, gyóntatás vasárnap 9:30-tól.",
        },
      ],
      { emails: new Set(), phones: new Set(), phoneTexts: [] },
    );
    expect(blocks).toHaveLength(1);
    expect(stats.paragraphsDropped).toBe(2);
  });

  it("drops name lists under person-list headings until the next heading of the same level", () => {
    const { blocks } = scrubBlocks(
      [
        { type: "heading", level: 2, text: "A kórus tagjai" },
        { type: "list", items: ["Kovács Anna", "Nagy Béla"] },
        { type: "heading", level: 2, text: "Próbák" },
        { type: "paragraph", text: "Kedden este próbálunk." },
        { type: "paragraph", text: "Megkeresztelkedett: Szabó Dóra" },
      ],
      { emails: new Set(), phones: new Set(), phoneTexts: [] },
    );
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
  });
});

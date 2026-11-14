import { describe, expect, it } from "vitest";
import type { Media, PageBlock, PageSummary, PublicPerson } from "@churchy/contracts";
import { termsForDenomination } from "@/i18n/terms";
import {
  aboutPages,
  blockMedia,
  blockMediaIds,
  canonicalPagePath,
  groupStaff,
  hasCtaTo,
  isReservedPageSlug,
  publicImage,
  ritePath,
  riteRequestPath,
  ritesPath,
  ritesSectionPage,
} from "./public-pages";

const rk = termsForDenomination("rk");
const ref = termsForDenomination("ref");
const bapt = termsForDenomination("bapt");

const summary = (p: Partial<PageSummary> & Pick<PageSummary, "slug">): PageSummary => ({
  id: `page-${p.slug}`,
  title: p.slug,
  parentId: null,
  riteKey: null,
  sort: 0,
  ...p,
});

const PAGES: PageSummary[] = [
  summary({ slug: "rolunk", sort: 1 }),
  summary({ slug: "tortenetunk", sort: 2 }),
  summary({ slug: "szertartasok", sort: 10 }),
  summary({ slug: "keresztelo", riteKey: "keresztelo", parentId: "page-szertartasok", sort: 11 }),
  summary({ slug: "alpont", parentId: "page-rolunk", sort: 20 }),
  summary({ slug: "hirek", sort: 30 }),
];

describe("reserved page slugs", () => {
  it("reserves fixed routes and the church's section term slugs", () => {
    for (const slug of ["hirek", "esemenyek", "kapcsolat", "templomaink", "admin", "term"]) {
      expect(isReservedPageSlug(slug, rk), slug).toBe(true);
    }
    for (const slug of ["miserend", "hirdetesek", "szentsegek", "munkatarsaink"]) {
      expect(isReservedPageSlug(slug, rk), slug).toBe(true);
    }
    expect(isReservedPageSlug("istentiszteleti-rend", ref)).toBe(true);
    expect(isReservedPageSlug("alkalmak", ref)).toBe(true);
    expect(isReservedPageSlug("eletesemenyek", bapt)).toBe(true);
  });

  it("leaves ordinary page slugs (and the about page) free", () => {
    for (const slug of ["rolunk", "tortenetunk", "templomunk", "szertartasok"]) {
      expect(isReservedPageSlug(slug, rk), slug).toBe(false);
    }
    // Another denomination's term slug is a normal page slug here.
    expect(isReservedPageSlug("istentiszteleti-rend", rk)).toBe(false);
  });
});

describe("page paths", () => {
  it("builds term-driven rite paths", () => {
    expect(ritesPath(rk)).toBe("/szentsegek");
    expect(ritePath(ref, "konfirmacio")).toBe("/alkalmak/konfirmacio");
    expect(riteRequestPath(bapt, "bemerites")).toBe("/eletesemenyek/bemerites/bejelentes");
  });

  it("puts rite pages and the rites intro page into the rites section", () => {
    const at = (slug: string) =>
      canonicalPagePath(
        PAGES.find((p) => p.slug === slug)!,
        PAGES,
        rk,
      );
    expect(at("rolunk")).toBe("/rolunk");
    expect(at("keresztelo")).toBe("/szentsegek/keresztelo");
    expect(at("szertartasok")).toBe("/szentsegek");
    expect(at("hirek")).toBeNull();
    expect(ritesSectionPage(PAGES)?.slug).toBe("szertartasok");
    expect(ritesSectionPage(PAGES.filter((p) => p.riteKey === null))).toBeNull();
  });

  it("lists top-level static pages for the about menu", () => {
    expect(aboutPages(PAGES, rk).map((p) => p.slug)).toEqual(["rolunk", "tortenetunk"]);
  });
});

const media = (m: Partial<Media>): Media => ({
  id: "m1",
  tenantId: "t-1",
  kind: "image",
  filename: "kep.svg",
  mimeType: "image/svg+xml",
  storageKey: "demo/templom.svg",
  variants: [],
  width: 1600,
  height: 900,
  bytes: 1000,
  alt: "A templom",
  decorative: false,
  caption: null,
  peopleConsent: true,
  visibility: "public",
  uploadedBy: null,
  createdAt: "2026-11-01T10:00:00+01:00",
  ...m,
});

describe("block media", () => {
  it("collects the media ids of image, gallery and file blocks", () => {
    const blocks: PageBlock[] = [
      { type: "image", mediaId: "a", caption: null },
      { type: "gallery", mediaIds: ["a", "b"] },
      { type: "file", mediaId: "c", label: "Fájl" },
      { type: "heading", text: "Cím", level: 2 },
    ];
    expect(blockMediaIds(blocks)).toEqual(["a", "b", "c"]);
  });

  it("serves only public demo images, with alt text (empty when decorative)", () => {
    expect(publicImage(media({}))).toEqual({
      src: "/demo/templom.svg",
      alt: "A templom",
      width: 1600,
      height: 900,
    });
    expect(publicImage(media({ decorative: true }))?.alt).toBe("");
    expect(publicImage(media({ visibility: "private" }))).toBeNull();
    expect(publicImage(media({ kind: "pdf" }))).toBeNull();
    expect(publicImage(media({ storageKey: "t/t-1/kep.jpg" }))).toBeNull();
    expect(publicImage(media({ storageKey: "demo/../titok.svg" }))).toBeNull();
    expect(publicImage(null)).toBeNull();
  });

  it("splits media into images and files", () => {
    const pdf = media({
      id: "p1",
      kind: "pdf",
      filename: "a.pdf",
      mimeType: "application/pdf",
      storageKey: "demo/minta-dokumentum.pdf",
      bytes: 48_200,
    });
    const { images, files } = blockMedia([media({}), pdf]);
    expect(Object.keys(images)).toEqual(["m1"]);
    expect(files["p1"]).toEqual({
      href: "/demo/minta-dokumentum.pdf",
      filename: "a.pdf",
      kilobytes: 47,
    });
  });

  it("knows whether the content already links to a path", () => {
    const blocks: PageBlock[] = [{ type: "cta", label: "Jelentkezés", href: "/a/b/bejelentes" }];
    expect(hasCtaTo(blocks, "/a/b/bejelentes")).toBe(true);
    expect(hasCtaTo(blocks, "/x")).toBe(false);
  });
});

const person = (p: Partial<PublicPerson>): PublicPerson => ({
  id: "p",
  prefix: null,
  familyName: "Minta",
  givenName: "Péter",
  suffix: null,
  roleTitle: null,
  staffGroup: "staff",
  bio: null,
  email: null,
  phone: null,
  photoMediaId: null,
  sort: 0,
  ...p,
});

describe("groupStaff", () => {
  it("orders groups clergy, staff, council, volunteers and drops empty ones", () => {
    const groups = groupStaff([
      person({ id: "c1", staffGroup: "council" }),
      person({ id: "s1" }),
      person({ id: "k1", staffGroup: "clergy" }),
      person({ id: "s2" }),
    ]);
    expect(groups.map((g) => [g.group, g.people.map((p) => p.id)])).toEqual([
      ["clergy", ["k1"]],
      ["staff", ["s1", "s2"]],
      ["council", ["c1"]],
    ]);
  });
});

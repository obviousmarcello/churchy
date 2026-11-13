import { describe, expect, it } from "vitest";
import { compareHu, sortHu } from "./index";

describe("compareHu", () => {
  it("returns negative, zero and positive", () => {
    expect(compareHu("a", "b")).toBeLessThan(0);
    expect(compareHu("b", "a")).toBeGreaterThan(0);
    expect(compareHu("alma", "alma")).toBe(0);
  });

  it.each([
    ["cukor", "csiga"], // cs after c
    ["csiga", "dió"], // cs before d
    ["dob", "dzsem"], // dz/dzs after d
    ["dzsem", "egér"],
    ["gabona", "gyár"], // gy after g
    ["gyár", "hal"],
    ["lakat", "lyuk"], // ly after l
    ["lyuk", "méz"],
    ["nap", "nyár"], // ny after n
    ["nyár", "óra"],
    ["sál", "szó"], // sz after s
    ["szó", "tál"],
    ["tál", "tyúk"], // ty after t
    ["tyúk", "ujj"],
    ["zita", "zsolt"], // zs after z
    ["zzz", "zsolt"],
  ])("%s sorts before %s", (a, b) => {
    expect(compareHu(a, b)).toBeLessThan(0);
    expect(compareHu(b, a)).toBeGreaterThan(0);
  });
});

describe("what Node's ICU does with digraphs (documented behaviour)", () => {
  it("orders digraphs and trigraph as letters between their neighbours", () => {
    const letters = [
      "c",
      "cs",
      "d",
      "dz",
      "dzs",
      "e",
      "g",
      "gy",
      "h",
      "l",
      "ly",
      "m",
      "n",
      "ny",
      "o",
      "s",
      "sz",
      "t",
      "ty",
      "u",
      "z",
      "zs",
    ];
    expect(sortHu([...letters].reverse())).toEqual(letters);
  });

  it("compares a digraph as one letter: gz < gy, sa < sz, cza < cs", () => {
    expect(sortHu(["gy", "gz", "g"])).toEqual(["g", "gz", "gy"]);
    expect(sortHu(["sz", "sa"])).toEqual(["sa", "sz"]);
    expect(sortHu(["csa", "cza"])).toEqual(["cza", "csa"]);
  });

  it("orders words within a digraph block by the following letters", () => {
    expect(sortHu(["zsolt", "zsák", "zs", "zz", "zá"])).toEqual([
      "zá",
      "zz",
      "zs",
      "zsák",
      "zsolt",
    ]);
    expect(sortHu(["dzsem", "dzs", "dz", "dá", "dzz"])).toEqual([
      "dá",
      "dz",
      "dzz",
      "dzs",
      "dzsem",
    ]);
  });

  it("treats doubled digraphs (ccs, ggy, ssz …) like the digraph written twice (primary level)", () => {
    expect(sortHu(["ccs", "cscs", "csc", "csccs"])).toEqual(["csc", "cscs", "ccs", "csccs"]);
    // same primary weights as the expansion, differing only at the tertiary level
    expect(sortHu(["gyh", "ggya", "ggy", "gygy", "gyga"])).toEqual([
      "gyga",
      "gygy",
      "ggy",
      "ggya",
      "gyh",
    ]);
    expect(sortHu(["ssz", "szt", "szsz", "szs", "sz"])).toEqual([
      "sz",
      "szs",
      "szsz",
      "ssz",
      "szt",
    ]);
    expect(sortHu(["ggy", "gyár", "győr"])).toEqual(["gyár", "ggy", "győr"]);
  });
});

describe("long and short vowels", () => {
  it("sorts o/ó before ö/ő and u/ú before ü/ű at the primary level", () => {
    expect(sortHu(["öa", "ob", "oa", "óa", "őa", "ua", "üa", "úa", "űa", "ub"])).toEqual([
      "oa",
      "óa",
      "ob",
      "öa",
      "őa",
      "ua",
      "úa",
      "ub",
      "üa",
      "űa",
    ]);
  });

  it("breaks ties short before long (o < ó, ö < ő, u < ú, ü < ű, a < á)", () => {
    expect(compareHu("o", "ó")).toBeLessThan(0);
    expect(compareHu("ö", "ő")).toBeLessThan(0);
    expect(compareHu("u", "ú")).toBeLessThan(0);
    expect(compareHu("ü", "ű")).toBeLessThan(0);
    expect(compareHu("a", "á")).toBeLessThan(0);
    expect(sortHu(["ű", "ü", "ú", "u", "ő", "ö", "ó", "o"])).toEqual([
      "o",
      "ó",
      "ö",
      "ő",
      "u",
      "ú",
      "ü",
      "ű",
    ]);
  });

  it("puts o/ó/ö/ő words in the expected order", () => {
    expect(sortHu(["ördög", "ózon", "ocsú", "őr", "olaj", "ökör"])).toEqual([
      "ocsú",
      "olaj",
      "ózon",
      "ökör",
      "őr",
      "ördög",
    ]);
  });

  it("is case-sensitive only as a tie-breaker (lower case first)", () => {
    expect(compareHu("a", "A")).toBeLessThan(0);
    expect(
      sortHu(["Ágnes", "Zita", "Éva", "Ödön", "Örs", "Ilona", "Ottó", "Úr", "Ügy", "Ubul"]),
    ).toEqual(["Ágnes", "Éva", "Ilona", "Ottó", "Ödön", "Örs", "Ubul", "Úr", "Ügy", "Zita"]);
  });
});

describe("sortHu", () => {
  it("sorts strings without mutating the input", () => {
    const input = ["zsolt", "zita", "csaba", "cecília", "dénes"];
    const out = sortHu(input);
    expect(out).toEqual(["cecília", "csaba", "dénes", "zita", "zsolt"]);
    expect(input).toEqual(["zsolt", "zita", "csaba", "cecília", "dénes"]);
  });

  it("sorts objects by key and is stable", () => {
    const people = [
      { name: "Szabó", id: 1 },
      { name: "Szalai", id: 2 },
      { name: "Csonka", id: 3 },
      { name: "Szabó", id: 4 },
      { name: "Cseh", id: 5 },
    ];
    expect(sortHu(people, (p) => p.name).map((p) => p.id)).toEqual([5, 3, 1, 4, 2]);
  });

  it("returns an empty array for an empty list", () => {
    expect(sortHu([])).toEqual([]);
  });
});

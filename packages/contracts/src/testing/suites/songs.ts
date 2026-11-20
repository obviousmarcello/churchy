import { expect, it } from "vitest";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

export const songsContract = defineContractSuite("songs", (t) => {
  it("manages songs with hymnal references and finds them accent-insensitively", async () => {
    const abbreviation = uniq("SF").toUpperCase().slice(0, 12);
    const hymnal = await t.repo.upsertHymnal(t.ctx.a, { abbreviation, name: "Saját énekfüzet" });
    expect(hymnal.tenantId).toBe(t.env.tenantA);
    expect(ids(await t.repo.listHymnals(t.ctx.a))).toContain(hymnal.id);
    const song = await t.repo.upsert(t.ctx.a, {
      title: "Áldott légy, Uram",
      firstLine: "Áldott légy, Uram, mindenkor",
      licence: "public_domain",
      themes: ["hálaadás"],
      defaultKey: "G",
      hymnalRefs: [{ hymnalId: hymnal.id, number: "42" }],
    });
    expect(song).toMatchObject({ language: "hu", altTitles: [], tempoBpm: null });
    expect(ids(await t.repo.search(t.ctx.a, { query: "aldott legy" }))).toContain(song.id);
    expect(ids(await t.repo.search(t.ctx.a, { query: `${abbreviation} 42` }))).toContain(song.id);
    expect(ids(await t.repo.search(t.ctx.a, { theme: "hálaadás" }))).toContain(song.id);

    const arrangement = await t.repo.upsertArrangement(t.ctx.a, {
      songId: song.id,
      name: "Gitáros",
      key: "A",
      chordpro: "{title: Áldott légy}\n[A]Áldott légy, [E]Uram",
    });
    expect(ids(await t.repo.listArrangements(t.ctx.a, song.id))).toEqual([arrangement.id]);
    await t.repo.delete(t.ctx.a, song.id);
    expect(await t.repo.get(t.ctx.a, song.id)).toBeNull();
    expect(await t.repo.listArrangements(t.ctx.a, song.id)).toEqual([]);
  });

  it("rejects invalid input", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, { title: "X", defaultKey: "H" }),
      "VALIDATION",
    );
    await expectContractError(t.repo.upsert(t.ctx.a, { title: "" }), "VALIDATION");
    await expectContractError(
      t.repo.upsert(t.ctx.a, { title: "X", licence: "cc" as never }),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.upsert(t.ctx.a, {
        title: "X",
        hymnalRefs: [{ hymnalId: "nincs-ilyen", number: "1" }],
      }),
      "NOT_FOUND",
    );
  });

  it("never returns, modifies or references tenant A's songs from tenant B", async () => {
    const hymnal = await t.repo.upsertHymnal(t.ctx.a, { abbreviation: "AF", name: "A füzete" });
    const song = await t.repo.upsert(t.ctx.a, { title: "Csak A éneke" });
    expect(await t.repo.get(t.ctx.b, song.id)).toBeNull();
    expect(ids(await t.repo.search(t.ctx.b, { query: "csak a eneke" }))).not.toContain(song.id);
    expect(ids(await t.repo.listHymnals(t.ctx.b))).not.toContain(hymnal.id);
    expect(await t.repo.search(t.ctx.anonA)).toEqual([]);
    await expectContractError(
      t.repo.upsert(t.ctx.b, {
        title: "Idegen",
        hymnalRefs: [{ hymnalId: hymnal.id, number: "1" }],
      }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.upsertArrangement(t.ctx.b, { songId: song.id, name: "Idegen", key: "C" }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.upsertHymnal(t.ctx.b, { id: hymnal.id, abbreviation: "X", name: "X" }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.delete(t.ctx.b, song.id), "NOT_FOUND");
    // Platform catalog hymnals (tenantId null) are shared by everyone.
    const platformA = (await t.repo.listHymnals(t.ctx.a)).filter((h) => h.tenantId === null);
    const platformB = (await t.repo.listHymnals(t.ctx.b)).filter((h) => h.tenantId === null);
    expect(ids(platformB)).toEqual(ids(platformA));
  });
});

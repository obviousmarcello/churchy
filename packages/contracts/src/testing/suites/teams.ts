import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { PersonRepo } from "../../modules/people";
import { defineContractSuite, expectContractError, ids } from "../harness";

async function volunteer(people: PersonRepo, ctx: Ctx) {
  return people.upsert(ctx, { familyName: "Szabó", givenName: "Anna", skills: ["ének"] });
}

export const teamsContract = defineContractSuite("teams", (t) => {
  it("manages teams, positions and memberships", async () => {
    const team = await t.repo.upsert(t.ctx.a, { name: "Ifjúsági zenekar", kind: "music" });
    const voice = await t.repo.upsertPosition(t.ctx.a, { teamId: team.id, name: "Ének", sort: 1 });
    const guitar = await t.repo.upsertPosition(t.ctx.a, {
      teamId: team.id,
      name: "Gitár",
      sort: 0,
      maxCount: 2,
    });
    expect(ids(await t.repo.listPositions(t.ctx.a, team.id))).toEqual([guitar.id, voice.id]);
    const p = await volunteer(t.need("people"), t.ctx.a);
    const member = await t.repo.upsertMember(t.ctx.a, {
      teamId: team.id,
      personId: p.id,
      positionIds: [voice.id, guitar.id],
      isLeader: true,
    });
    expect(member).toMatchObject({
      tenantId: t.env.tenantA,
      isLeader: true,
      maxAssignmentsPerMonth: null,
    });
    expect((await t.repo.listMembers(t.ctx.a, { personId: p.id })).map((m) => m.teamId)).toEqual([
      team.id,
    ]);
    await t.repo.deletePosition(t.ctx.a, guitar.id);
    const [after] = await t.repo.listMembers(t.ctx.a, { teamId: team.id, personId: p.id });
    expect(after?.positionIds).toEqual([voice.id]);
    await t.repo.removeMember(t.ctx.a, team.id, p.id);
    expect(await t.repo.listMembers(t.ctx.a, { teamId: team.id })).toEqual([]);
  });

  it("rejects invalid input and positions of another team", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, { name: "X", kind: "korus" as never }),
      "VALIDATION",
    );
    const team = await t.repo.upsert(t.ctx.a, { name: "Lektorok", kind: "liturgy" });
    await expectContractError(
      t.repo.upsertPosition(t.ctx.a, { teamId: team.id, name: "Lektor", minCount: 3, maxCount: 1 }),
      "VALIDATION",
    );
    const other = await t.repo.upsert(t.ctx.a, { name: "Technika", kind: "tech" });
    const foreign = await t.repo.upsertPosition(t.ctx.a, {
      teamId: other.id,
      name: "Hangtechnika",
    });
    const p = await volunteer(t.need("people"), t.ctx.a);
    await expectContractError(
      t.repo.upsertMember(t.ctx.a, { teamId: team.id, personId: p.id, positionIds: [foreign.id] }),
      "VALIDATION",
    );
  });

  it("never returns, modifies or references tenant A's teams from tenant B", async () => {
    const team = await t.repo.upsert(t.ctx.a, { name: "Csak A csapata", kind: "other" });
    expect(await t.repo.get(t.ctx.b, team.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(team.id);
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    expect(await t.repo.listPositions(t.ctx.b, team.id)).toEqual([]);
    const personB = await volunteer(t.need("people"), t.ctx.b);
    await expectContractError(
      t.repo.upsertMember(t.ctx.b, { teamId: team.id, personId: personB.id }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.upsertPosition(t.ctx.b, { teamId: team.id, name: "X" }),
      "NOT_FOUND",
    );
    await expectContractError(t.repo.delete(t.ctx.b, team.id), "NOT_FOUND");
    await t.repo.delete(t.ctx.a, team.id);
    expect(await t.repo.get(t.ctx.a, team.id)).toBeNull();
  });
});

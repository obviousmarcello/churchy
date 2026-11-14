import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { Repositories } from "../../registry";
import { defineContractSuite, expectContractError, ids } from "../harness";
import { occurrenceFor } from "./service-plans";

const STARTS = "2032-06-06T10:00:00+02:00";
const ENDS = "2032-06-06T11:15:00+02:00";

async function setupTeam(
  repos: Pick<Repositories, "teams" | "people" | "locations" | "schedule">,
  ctx: Ctx,
) {
  const team = await repos.teams.upsert(ctx, { name: "Zenei szolgálat", kind: "music" });
  const position = await repos.teams.upsertPosition(ctx, { teamId: team.id, name: "Gitár" });
  const anna = await repos.people.upsert(ctx, { familyName: "Szabó", givenName: "Anna" });
  const bence = await repos.people.upsert(ctx, { familyName: "Tóth", givenName: "Bence" });
  for (const p of [anna, bence]) {
    await repos.teams.upsertMember(ctx, {
      teamId: team.id,
      personId: p.id,
      positionIds: [position.id],
    });
  }
  const occ = await occurrenceFor(repos, ctx, STARTS);
  return { team, position, anna, bence, occ };
}

export const assignmentsContract = defineContractSuite("assignments", (t) => {
  const deps = () => ({
    teams: t.need("teams"),
    people: t.need("people"),
    locations: t.need("locations"),
    schedule: t.need("schedule"),
  });

  it("requests, accepts and swaps assignments", async () => {
    const { team, position, anna, bence, occ } = await setupTeam(deps(), t.ctx.a);
    const [a] = await t.repo.create(t.ctx.a, [
      {
        occurrenceId: occ.id,
        teamId: team.id,
        positionId: position.id,
        personId: anna.id,
        startsAt: STARTS,
        endsAt: ENDS,
      },
    ]);
    expect(a).toMatchObject({ status: "requested", respondedAt: null, eventId: null });
    const accepted = await t.repo.respond(t.ctx.a, a!.id, { accept: true });
    expect(accepted.status).toBe("accepted");
    expect(accepted.respondedAt).not.toBeNull();
    await expectContractError(t.repo.respond(t.ctx.a, a!.id, { accept: false }), "CONFLICT");

    const swap = await t.repo.requestSwap(t.ctx.a, a!.id);
    expect(swap.status).toBe("swap_requested");
    const taken = await t.repo.acceptSwap(t.ctx.a, a!.id, bence.id);
    expect(taken).toMatchObject({ personId: bence.id, status: "accepted" });
    expect((await t.repo.get(t.ctx.a, a!.id))?.status).toBe("cancelled");
    await expectContractError(t.repo.acceptSwap(t.ctx.a, a!.id, anna.id), "CONFLICT");

    const window = { from: "2032-06-06T00:00:00+02:00", to: "2032-06-06T23:59:00+02:00" };
    expect(ids(await t.repo.list(t.ctx.a, { ...window, personId: bence.id }))).toEqual([taken.id]);
    expect(
      ids(await t.repo.list(t.ctx.a, { occurrenceId: occ.id, statuses: ["accepted"] })),
    ).toEqual([taken.id]);
  });

  it("records declines with a reason", async () => {
    const { team, position, anna, occ } = await setupTeam(deps(), t.ctx.a);
    const [a] = await t.repo.create(t.ctx.a, [
      {
        occurrenceId: occ.id,
        teamId: team.id,
        positionId: position.id,
        personId: anna.id,
        startsAt: STARTS,
        endsAt: ENDS,
      },
    ]);
    const declined = await t.repo.respond(t.ctx.a, a!.id, {
      accept: false,
      declineReason: "Nem leszek itthon.",
    });
    expect(declined).toMatchObject({ status: "declined", declineReason: "Nem leszek itthon." });
  });

  it("rejects invalid input", async () => {
    const { team, anna, occ } = await setupTeam(deps(), t.ctx.a);
    const otherTeam = await t.need("teams").upsert(t.ctx.a, { name: "Lektorok", kind: "liturgy" });
    const foreign = await t
      .need("teams")
      .upsertPosition(t.ctx.a, { teamId: otherTeam.id, name: "Lektor" });
    const base = {
      occurrenceId: occ.id,
      teamId: team.id,
      positionId: foreign.id,
      personId: anna.id,
      startsAt: STARTS,
      endsAt: ENDS,
    };
    await expectContractError(t.repo.create(t.ctx.a, [base]), "VALIDATION");
    await expectContractError(t.repo.create(t.ctx.a, [{ ...base, endsAt: STARTS }]), "VALIDATION");
    await expectContractError(
      t.repo.create(t.ctx.a, [{ ...base, occurrenceId: null }]),
      "VALIDATION",
    );
  });

  it("never returns, modifies or references tenant A's assignments from tenant B", async () => {
    const { team, position, anna, occ } = await setupTeam(deps(), t.ctx.a);
    const [a] = await t.repo.create(t.ctx.a, [
      {
        occurrenceId: occ.id,
        teamId: team.id,
        positionId: position.id,
        personId: anna.id,
        startsAt: STARTS,
        endsAt: ENDS,
      },
    ]);
    expect(await t.repo.get(t.ctx.b, a!.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b, {}))).not.toContain(a!.id);
    expect(await t.repo.list(t.ctx.anonA, {})).toEqual([]);
    await expectContractError(t.repo.respond(t.ctx.b, a!.id, { accept: true }), "NOT_FOUND");
    await expectContractError(t.repo.cancel(t.ctx.b, a!.id), "NOT_FOUND");
    const own = await setupTeam(deps(), t.ctx.b);
    await expectContractError(
      t.repo.create(t.ctx.b, [
        {
          occurrenceId: own.occ.id,
          teamId: team.id,
          positionId: position.id,
          personId: own.anna.id,
          startsAt: STARTS,
          endsAt: ENDS,
        },
      ]),
      "NOT_FOUND",
    );
    expect((await t.repo.get(t.ctx.a, a!.id))?.status).toBe("requested");
  });
});

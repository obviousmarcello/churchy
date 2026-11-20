import { expect, it } from "vitest";
import type { Ctx } from "../../ctx";
import type { Repositories } from "../../registry";
import { defineContractSuite, expectContractError, ids, uniq } from "../harness";

/** A materialized service occurrence (location + ensureOccurrence). */
export async function occurrenceFor(
  repos: Pick<Repositories, "locations" | "schedule">,
  ctx: Ctx,
  startsAt = "2032-06-06T10:00:00+02:00",
) {
  const loc = await repos.locations.upsert(ctx, {
    name: "Templom",
    slug: uniq("templom"),
    kind: "templom",
  });
  return repos.schedule.ensureOccurrence(ctx, {
    locationId: loc.id,
    startsAt,
    serviceType: "szentmise",
  });
}

export const servicePlansContract = defineContractSuite("servicePlans", (t) => {
  const deps = () => ({ locations: t.need("locations"), schedule: t.need("schedule") });
  const items = [
    { type: "song" as const, title: "Bevonulási ének" },
    { type: "reading" as const, title: "Első olvasmány", durationS: 180 },
  ];

  it("builds, approves and locks a plan", async () => {
    const occ = await occurrenceFor(deps(), t.ctx.a);
    const plan = await t.repo.upsert(t.ctx.a, {
      occurrenceId: occ.id,
      title: "Vasárnapi szentmise",
      leaderPersonId: t.env.actorA.personId,
    });
    expect(plan).toMatchObject({ status: "draft", approvedSnapshot: null, eventId: null });
    const saved = await t.repo.setItems(t.ctx.a, plan.id, items);
    expect(saved.map((i) => i.position)).toEqual([0, 1]);
    const approved = await t.repo.setStatus(t.ctx.a, plan.id, "approved");
    expect(approved.approvedByPersonId).toBe(t.env.actorA.personId);
    expect(approved.approvedSnapshot).toHaveLength(2);
    const reordered = await t.repo.setItems(t.ctx.a, plan.id, [items[1]!, items[0]!]);
    expect(reordered.map((i) => i.title)).toEqual(["Első olvasmány", "Bevonulási ének"]);
    const locked = await t.repo.setStatus(t.ctx.a, plan.id, "locked");
    expect(locked.lockedAt).not.toBeNull();
    await expectContractError(t.repo.setItems(t.ctx.a, plan.id, items), "CONFLICT");
    await expectContractError(t.repo.delete(t.ctx.a, plan.id), "CONFLICT");
    expect((await t.repo.get(t.ctx.a, plan.id))?.items).toHaveLength(2);
  });

  it("creates plans from templates and handles comments", async () => {
    const template = await t.repo.upsertTemplate(t.ctx.a, {
      serviceType: "szentmise",
      name: "Vasárnapi mise",
      items: items.map((i) => ({ ...i })),
    });
    expect(ids(await t.repo.listTemplates(t.ctx.a, "szentmise"))).toContain(template.id);
    const occ = await occurrenceFor(deps(), t.ctx.a, "2032-06-13T10:00:00+02:00");
    const created = await t.repo.createFromTemplate(t.ctx.a, template.id, {
      occurrenceId: occ.id,
      title: "Pünkösd utáni vasárnap",
      leaderPersonId: t.env.actorA.personId,
    });
    expect(created.plan.templateId).toBe(template.id);
    expect(created.items.map((i) => i.title)).toEqual(["Bevonulási ének", "Első olvasmány"]);

    const comment = await t.repo.addComment(t.ctx.a, {
      planId: created.plan.id,
      body: "Legyen egy ének a végén is.",
    });
    expect(comment).toMatchObject({ authorPersonId: t.env.actorA.personId, resolvedAt: null });
    expect((await t.repo.setCommentResolved(t.ctx.a, comment.id, true)).resolvedAt).not.toBeNull();
    expect(ids(await t.repo.listComments(t.ctx.a, created.plan.id))).toEqual([comment.id]);
  });

  it("rejects invalid input", async () => {
    await expectContractError(
      t.repo.upsert(t.ctx.a, { title: "Gazdátlan", leaderPersonId: t.env.actorA.personId }),
      "VALIDATION",
    );
    const occ = await occurrenceFor(deps(), t.ctx.a);
    const plan = await t.repo.upsert(t.ctx.a, {
      occurrenceId: occ.id,
      title: "Terv",
      leaderPersonId: t.env.actorA.personId,
    });
    await expectContractError(
      t.repo.setItems(t.ctx.a, plan.id, [{ type: "song", title: "Ének", keyOverride: "Hm" }]),
      "VALIDATION",
    );
    await expectContractError(
      t.repo.addComment(t.ctx.a, { planId: plan.id, body: "  " }),
      "VALIDATION",
    );
  });

  it("never returns, modifies or references tenant A's plans from tenant B", async () => {
    const occ = await occurrenceFor(deps(), t.ctx.a);
    const plan = await t.repo.upsert(t.ctx.a, {
      occurrenceId: occ.id,
      title: "Csak A",
      leaderPersonId: t.env.actorA.personId,
    });
    expect(await t.repo.get(t.ctx.b, plan.id)).toBeNull();
    expect(ids(await t.repo.list(t.ctx.b))).not.toContain(plan.id);
    expect(await t.repo.list(t.ctx.anonA)).toEqual([]);
    await expectContractError(t.repo.setItems(t.ctx.b, plan.id, items), "NOT_FOUND");
    await expectContractError(t.repo.setStatus(t.ctx.b, plan.id, "approved"), "NOT_FOUND");
    await expectContractError(
      t.repo.upsert(t.ctx.b, {
        occurrenceId: occ.id,
        title: "Idegen",
        leaderPersonId: t.env.actorB.personId,
      }),
      "NOT_FOUND",
    );
    await expectContractError(
      t.repo.addComment(t.ctx.b, { planId: plan.id, body: "Idegen" }),
      "NOT_FOUND",
    );
  });
});

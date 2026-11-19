import { notFound } from "next/navigation";
import { formatPersonName } from "@churchy/hu";
import { can } from "@churchy/policy";
import { Alert, Badge, ButtonLink, FormattedDate, FormattedTime } from "@churchy/ui";
import { PlanActions } from "@/components/worship/plan-actions";
import { PlanComments } from "@/components/worship/plan-comments";
import { PlanEditor, type EditorItem } from "@/components/worship/plan-editor";
import { AssignPicker, SwapButton } from "@/components/worship/assignment-tools";
import { AssignmentButtons } from "@/components/workspace/assignment-buttons";
import { getEntryLabels } from "@/components/workspace/entry-labels";
import { getT } from "@/i18n/server";
import { formatChord, type Notation } from "@/lib/worship/music";
import { diffPlan, totalMinutes, transitionsFrom } from "@/lib/worship/plan-flow";
import { rankCandidates, type RankReason } from "@/lib/worship/ranking";
import { respondToAssignment } from "@/server/workspace-actions";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import {
  canViewPlan,
  hymnalRefLabels,
  lastUsedBySong,
  planAssignments,
  planViewResources,
  planWhen,
} from "@/server/worship";
import {
  addPlanComment,
  assignPerson,
  decidePlan,
  requestAssignmentSwap,
  resolvePlanComment,
  savePlanItems,
  submitPlanForReview,
  takeOverAssignment,
} from "@/server/worship-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.worship"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const TONE = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  locked: "info",
} as const;
const ASG_TONE = {
  requested: "warning",
  accepted: "success",
  declined: "danger",
  swap_requested: "warning",
  cancelled: "neutral",
} as const;
const dateTime = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("hu-HU", {
  timeZone: "Europe/Budapest",
  dateStyle: "medium",
});

/** One plan (D-66, D-67, D-68): items, status flow, team, comments and the post-approval diff. */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.worship");
  const [{ id }, query, env, t, labels] = await Promise.all([
    params,
    searchParams,
    getMemberEnv(),
    getT("munkater.worship"),
    getEntryLabels(),
  ]);
  const { repos, ctx, actor, tenantId, me } = env;
  const loaded = await repos.servicePlans.get(ctx, id);
  if (loaded === null) notFound();
  const { plan, items } = loaded;
  const assignments = await planAssignments(repos, ctx, plan);
  if (!canViewPlan(actor, planViewResources(tenantId, assignments))) notFound();

  const notation: Notation = query["jeloles"] === "en" ? "en" : "hu";
  const locked = plan.status === "locked";
  const mayEdit = can(actor, "servicePlan.edit", { tenantId, teamId: null });
  const mayApprove = can(actor, "servicePlan.approve", {
    tenantId,
    teamId: null,
    musicLeaderMayApprove: false,
  });
  const [when, songs, hymnals, people, teams, comments, usedBy, allAssignments, members] =
    await Promise.all([
      planWhen(env, plan),
      repos.songs.search(ctx),
      repos.songs.listHymnals(ctx),
      repos.people.list(ctx, { active: true }),
      repos.teams.list(ctx),
      repos.servicePlans.listComments(ctx, id),
      lastUsedBySong(env),
      repos.assignments.list(ctx, { statuses: ["requested", "accepted", "swap_requested"] }),
      repos.teams.listMembers(ctx, {}),
    ]);
  const nameOf = new Map(
    people.map((p) => [
      p.id,
      formatPersonName({ familyName: p.familyName, givenName: p.givenName }),
    ]),
  );
  const personName = (pid: string | null) => (pid ? (nameOf.get(pid) ?? "") : "");
  const songById = new Map(songs.map((s) => [s.id, s]));
  const arrangements = new Map(
    await Promise.all(
      songs.map(async (s) => [s.id, await repos.songs.listArrangements(ctx, s.id)] as const),
    ),
  );

  const editorSongs = songs.map((s) => ({
    id: s.id,
    title: s.title,
    refs: hymnalRefLabels(s, hymnals).join(", "),
    defaultKey: s.defaultKey,
    lastUsed: usedBy.has(s.id) ? dateOnly.format(new Date(`${usedBy.get(s.id)}T12:00:00Z`)) : null,
    arrangements: (arrangements.get(s.id) ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      key: a.key,
    })),
  }));
  const editorItems: EditorItem[] = items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    songId: i.songId,
    arrangementId: i.arrangementId,
    keyOverride: i.keyOverride,
    verses: i.verses,
    durationS: i.durationS,
    responsiblePersonId: i.responsiblePersonId,
    notes: i.notes,
  }));
  const peopleOptions = people.map((p) => ({ id: p.id, name: personName(p.id) }));

  const next = transitionsFrom(plan.status);
  const available = {
    submit: next.some((x) => x.to === "in_review"),
    approve: next.some((x) => x.to === "approved"),
    sendBack: next.some((x) => x.from === "in_review" && x.to === "draft"),
  };
  const diff =
    plan.status === "approved" && plan.approvedSnapshot
      ? diffPlan(plan.approvedSnapshot, items)
      : null;

  // Team: positions with assignments, candidates for the leaders.
  const teamIdsWithAsg = new Set(assignments.map((a) => a.teamId));
  const absences = await repos.absences.list(ctx, {
    from: (when.startsAt ?? "").slice(0, 10) || env.today,
    to: (when.startsAt ?? "").slice(0, 10) || env.today,
    statuses: ["approved"],
  });
  const teamBlocks = await Promise.all(
    teams.map(async (team) => {
      const manage = can(actor, "assignment.manage", { tenantId, teamId: team.id });
      if (!teamIdsWithAsg.has(team.id) && !(manage && !locked)) return null;
      const positions = await repos.teams.listPositions(ctx, team.id);
      const teamMembers = members.filter((m) => m.teamId === team.id);
      const isMember = me !== null && teamMembers.some((m) => m.personId === me.personId);
      return { team, manage, positions, teamMembers, isMember };
    }),
  );
  const reasonText = (r: RankReason) =>
    r.kind === "notServed"
      ? t("assignments.reasons.notServed", { weeks: r.weeks })
      : r.kind === "servedRecently"
        ? t("assignments.reasons.servedRecently", { count: r.count })
        : t("assignments.reasons.overMonthlyMax");

  const commentViews = comments.map((c) => ({
    id: c.id,
    author: personName(c.authorPersonId),
    when: dateTime.format(new Date(c.createdAt)),
    body: c.body,
    itemTitle: c.itemId ? (items.find((i) => i.id === c.itemId)?.title ?? null) : null,
    mentioned: c.mentions.map(personName),
    resolved: c.resolvedAt !== null,
  }));

  return (
    <div
      className="flex max-w-4xl flex-col gap-6"
      data-testid="plan-page"
      data-status={plan.status}
    >
      <ButtonLink href="/munkater/liturgia" variant="secondary" size="sm" className="self-start">
        {t("back")}
      </ButtonLink>
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {plan.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[plan.status]} data-testid="plan-status">
            {labels.planStatus[plan.status]}
          </Badge>
          {when.startsAt ? (
            <span className="text-fs-4">
              <FormattedDate value={when.startsAt} format="long" />{" "}
              <FormattedTime value={when.startsAt} />
            </span>
          ) : null}
          {when.locationName ? <span className="text-muted">{when.locationName}</span> : null}
          <span className="text-muted">
            {t("leader", { name: personName(plan.leaderPersonId) })}
          </span>
        </div>
        <PlanActions
          submit={mayEdit ? submitPlanForReview.bind(null, id) : null}
          approve={mayApprove ? decidePlan.bind(null, id, "approve") : null}
          sendBack={mayApprove ? decidePlan.bind(null, id, "return") : null}
          available={available}
        />
      </header>

      {locked ? (
        <Alert tone="info" title={t("lockedTitle")}>
          <p>{t("lockedBody")}</p>
        </Alert>
      ) : null}
      {plan.status === "in_review" ? (
        <Alert tone="warning" title={t("reviewTitle")}>
          <p>{mayApprove ? t("reviewBodyApprover") : t("reviewBody")}</p>
        </Alert>
      ) : null}

      {diff && !diff.empty ? (
        <section
          aria-labelledby="diff-h"
          className="rounded-md border-2 border-warning p-4"
          data-testid="plan-diff"
        >
          <h2 id="diff-h" className="font-heading text-fs-5 font-bold">
            {t("diff.title")}
          </h2>
          <p className="text-muted">{t("diff.lead")}</p>
          <ul className="mt-2 list-disc pl-6">
            {diff.added.map((i) => (
              <li key={`a${i.id}`}>{t("diff.added", { title: i.title })}</li>
            ))}
            {diff.removed.map((i) => (
              <li key={`r${i.id}`}>{t("diff.removed", { title: i.title })}</li>
            ))}
            {diff.moved.map((m) => (
              <li key={`m${m.item.id}`}>
                {t("diff.moved", { title: m.item.title, from: m.from + 1, to: m.to + 1 })}
              </li>
            ))}
            {diff.keyChanges.map((k) => (
              <li key={`k${k.item.id}`}>
                {t("diff.key", {
                  title: k.item.title,
                  from: k.from ? formatChord(k.from, notation) : t("diff.defaultKey"),
                  to: k.to ? formatChord(k.to, notation) : t("diff.defaultKey"),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="items-h" className="flex flex-col gap-2">
        <h2 id="items-h" className="font-heading text-fs-5 font-bold">
          {t("items")}
        </h2>
        {mayEdit && !locked ? (
          <PlanEditor
            planId={id}
            items={editorItems}
            songs={editorSongs}
            people={peopleOptions}
            save={savePlanItems}
            notation={notation}
          />
        ) : (
          <>
            <ol className="flex flex-col gap-2" data-testid="plan-items-readonly">
              {items.map((i, n) => {
                const song = i.songId ? songById.get(i.songId) : undefined;
                const key = i.keyOverride ?? song?.defaultKey ?? null;
                return (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-raised p-2"
                  >
                    <span className="w-6 text-right text-muted">{n + 1}.</span>
                    <Badge>{t(`editor.types.${i.type}`)}</Badge>
                    <span className="font-semibold">{i.title}</span>
                    {song ? (
                      <span className="text-muted">
                        {hymnalRefLabels(song, hymnals).join(", ")}
                      </span>
                    ) : null}
                    {key ? <span className="text-muted">{formatChord(key, notation)}</span> : null}
                    {i.responsiblePersonId ? (
                      <span className="text-muted">{personName(i.responsiblePersonId)}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <p className="font-semibold">{t("editor.total", { minutes: totalMinutes(items) })}</p>
          </>
        )}
      </section>

      <section aria-labelledby="team-h" className="flex flex-col gap-3" data-testid="plan-team">
        <h2 id="team-h" className="font-heading text-fs-5 font-bold">
          {t("assignments.title")}
        </h2>
        {teamBlocks.every((b) => b === null) ? (
          <p className="text-muted">{t("assignments.empty")}</p>
        ) : null}
        {teamBlocks.map((block) => {
          if (block === null) return null;
          const { team, manage, positions, teamMembers, isMember } = block;
          return (
            <div key={team.id} className="rounded-md border border-border bg-surface-raised p-3">
              <h3 className="font-semibold">{team.name}</h3>
              <ul className="mt-2 flex flex-col gap-3">
                {positions.map((pos) => {
                  const rows = assignments.filter(
                    (a) => a.positionId === pos.id && a.status !== "cancelled",
                  );
                  const candidates =
                    manage && !locked && when.startsAt && when.endsAt
                      ? rankCandidates({
                          positionId: pos.id,
                          startsAt: when.startsAt,
                          endsAt: when.endsAt,
                          date: when.startsAt.slice(0, 10),
                          members: teamMembers.map((m) => ({
                            id: m.personId,
                            active: people.some((p) => p.id === m.personId),
                            positionIds: m.positionIds,
                            maxPerMonth: m.maxAssignmentsPerMonth,
                          })),
                          absences,
                          assignments: allAssignments,
                        })
                          .filter((c) => !rows.some((r) => r.personId === c.personId))
                          .slice(0, 6)
                      : [];
                  if (rows.length === 0 && !manage) return null;
                  return (
                    <li key={pos.id} className="flex flex-col gap-2" data-testid="position">
                      <span className="font-semibold text-primary">{pos.name}</span>
                      {rows.map((a) => {
                        const mine = me !== null && a.personId === me.personId;
                        return (
                          <div
                            key={a.id}
                            className="flex flex-wrap items-center gap-2"
                            data-testid="assignment"
                          >
                            <span>{personName(a.personId)}</span>
                            <Badge tone={ASG_TONE[a.status]}>
                              {labels.assignmentStatus[a.status]}
                            </Badge>
                            {a.declineReason ? (
                              <span className="text-muted">{a.declineReason}</span>
                            ) : null}
                            {mine && a.status === "requested" ? (
                              <AssignmentButtons id={a.id} respond={respondToAssignment} />
                            ) : null}
                            {mine && a.status === "accepted" && !locked ? (
                              <SwapButton
                                mode="request"
                                action={requestAssignmentSwap.bind(null, a.id)}
                              />
                            ) : null}
                            {!mine && a.status === "swap_requested" && isMember && !locked ? (
                              <SwapButton
                                mode="takeOver"
                                action={takeOverAssignment.bind(null, a.id)}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                      {manage && !locked ? (
                        <AssignPicker
                          positionName={pos.name}
                          candidates={candidates.map((c) => ({
                            personId: c.personId,
                            label: `${personName(c.personId)} – ${c.reasons.map(reasonText).join(", ")}`,
                          }))}
                          assign={assignPerson.bind(null, team.id, id, pos.id)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="comments-h" className="flex flex-col gap-2">
        <h2 id="comments-h" className="font-heading text-fs-5 font-bold">
          {t("comments.title")}
        </h2>
        <PlanComments
          planId={id}
          comments={commentViews}
          items={items.map((i) => ({ id: i.id, title: i.title }))}
          people={peopleOptions}
          canResolve={mayEdit && !locked}
          readOnly={locked}
          add={addPlanComment}
          resolve={resolvePlanComment}
        />
      </section>
    </div>
  );
}

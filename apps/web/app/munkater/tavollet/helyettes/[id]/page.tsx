import { notFound } from "next/navigation";
import { FormattedDate } from "@churchy/ui";
import { addDays } from "@churchy/hu";
import { can } from "@churchy/policy";
import { SubstituteButton } from "@/components/hr/substitute-button";
import { getT } from "@/i18n/server";
import { substituteCandidates } from "@/lib/hr/conflicts";
import { getHrEnv, personLabel } from "@/server/hr";
import { requestSubstitute } from "@/server/hr-substitute-actions";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.absence"), getT("common")]);
  return {
    title: `${t("substituteTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** *Helyettes keresése*: free team members for an assignment that overlaps an absence. */
export default async function SubstitutePage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspaceModule("ws.hr.leave");
  const [{ id }, env, t] = await Promise.all([params, getHrEnv(), getT("munkater.absence")]);
  const { repos, ctx, actor, tenantId, today } = env;
  const assignment = await repos.assignments.get(ctx, id);
  if (
    assignment === null ||
    !can(actor, "assignment.manage", { tenantId, teamId: assignment.teamId })
  ) {
    notFound();
  }
  const [members, absences, slots, team] = await Promise.all([
    repos.teams.listMembers(ctx, { teamId: assignment.teamId }),
    repos.absences.list(ctx, {
      from: today,
      to: addDays(today, 400),
      statuses: ["approved", "requested"],
    }),
    repos.assignments.list(ctx, {
      statuses: ["requested", "accepted"],
      from: assignment.startsAt,
      to: assignment.endsAt,
    }),
    repos.teams.list(ctx),
  ]);
  const candidates = substituteCandidates(
    assignment,
    members.map((m) => m.personId),
    absences,
    slots,
  );
  return (
    <div className="flex flex-col gap-5" data-testid="substitute-page">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("substituteTitle")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">
          {personLabel(env, assignment.personId)} ·{" "}
          {team.find((x) => x.id === assignment.teamId)?.name} ·{" "}
          <FormattedDate format="long" value={assignment.startsAt} />
        </p>
      </header>
      {candidates.length === 0 ? (
        <p>{t("noCandidates")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((personId) => (
            <li
              key={personId}
              className="flex flex-wrap items-center gap-3 rounded-control border border-hairline p-3"
              data-testid="candidate"
            >
              <span className="font-bold">{personLabel(env, personId)}</span>
              <SubstituteButton run={requestSubstitute.bind(null, assignment.id, personId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

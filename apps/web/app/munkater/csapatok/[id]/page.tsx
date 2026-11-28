import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { Badge, ButtonLink, PersonName } from "@churchy/ui";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { ContactLines, nameOf } from "@/components/workspace/person-card";
import { getT } from "@/i18n/server";
import type { FieldDef } from "@/lib/admin/content-form";
import { getMemberEnv } from "@/server/workspace";
import { loadDirectory } from "@/server/workspace-people";
import {
  removeTeamMember,
  removeTeamPosition,
  saveTeamMember,
  saveTeamPosition,
} from "@/server/workspace-team-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.teams"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/**
 * One team (D-51): positions, members with their positions, and — for those who may assign people
 * to this team's positions (`assignment.manage`) — forms to add members and positions.
 */
export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, env, t] = await Promise.all([
    params,
    searchParams,
    getMemberEnv(),
    getT("munkater.teams"),
  ]);
  const { repos, ctx, actor, tenantId } = env;
  const team = await repos.teams.get(ctx, id);
  if (team === null) notFound();
  const [positions, data, allPeople] = await Promise.all([
    repos.teams.listPositions(ctx, id),
    loadDirectory(env),
    repos.people.list(ctx, { active: true }),
  ]);
  const members = data.entries.filter((e) => e.teams.some((m) => m.team.id === id));
  const manage = can(actor, "assignment.manage", { tenantId, teamId: id });
  const memberIds = new Set(members.map((m) => m.person.id));

  const memberFields: FieldDef[] = [
    {
      kind: "select",
      name: "personId",
      label: t("form.person"),
      required: true,
      placeholder: t("form.choose"),
      options: allPeople
        .filter((p) => !memberIds.has(p.id))
        .map((p) => ({ value: p.id, label: `${p.familyName} ${p.givenName}` })),
    },
    {
      kind: "select",
      name: "positionId",
      label: t("form.position"),
      placeholder: t("form.noPosition"),
      options: positions.map((p) => ({ value: p.id, label: p.name })),
    },
    { kind: "checkbox", name: "isLeader", label: t("form.isLeader") },
  ];
  const positionFields: FieldDef[] = [
    { kind: "text", name: "name", label: t("form.positionName"), required: true },
    { kind: "number", name: "minCount", label: t("form.minCount") },
    { kind: "number", name: "maxCount", label: t("form.maxCount") },
  ];
  const memberValues = { personId: "", positionId: "", isLeader: "" };
  const positionValues = { name: "", minCount: "1", maxCount: "" };

  return (
    <div className="flex max-w-3xl flex-col gap-6" data-testid="workspace-team">
      <ButtonLink href="/munkater/csapatok" variant="secondary" size="sm" className="self-start">
        {t("back")}
      </ButtonLink>
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {team.name}
        </h1>
        {team.description ? <p className="mt-1 text-fs-4 text-muted">{team.description}</p> : null}
      </header>
      <SavedNotice saved={query["mentve"] === "1"} />

      <section aria-labelledby="positions-heading">
        <h2 id="positions-heading" className="font-heading text-fs-5 font-bold">
          {t("positions")}
        </h2>
        {positions.length === 0 ? (
          <p className="text-muted">{t("noPositions")}</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {positions.map((p) => (
              <li key={p.id} className="flex min-h-11 flex-wrap items-center gap-2 py-2">
                <span className="font-semibold">{p.name}</span>
                <Badge>{t("needed", { min: p.minCount })}</Badge>
                {manage ? (
                  <span className="ml-auto">
                    <DeleteButton
                      name={p.name}
                      onDelete={removeTeamPosition.bind(null, id, p.id)}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {manage ? (
          <div className="mt-4">
            <h3 className="mb-2 font-semibold">{t("form.addPosition")}</h3>
            <EntityForm
              action={saveTeamPosition.bind(null, id)}
              fields={positionFields}
              values={positionValues}
              submitLabel={t("form.add")}
              cancelHref={`/munkater/csapatok/${id}`}
              testId="position-form"
            />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="font-heading text-fs-5 font-bold">
          {t("membersHeading")}
        </h2>
        {members.length === 0 ? (
          <p className="text-muted">{t("noMembers")}</p>
        ) : (
          <ul className="mt-2 grid gap-3 md:grid-cols-2">
            {members.map((entry) => {
              const membership = entry.teams.find((m) => m.team.id === id);
              return (
                <li
                  key={entry.person.id}
                  className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-3"
                  data-testid="team-member"
                >
                  <Link
                    href={`/munkater/nevjegyzek/${entry.person.id}`}
                    className="inline-flex min-h-11 items-center font-semibold text-primary"
                  >
                    <PersonName name={nameOf(entry.person)} />
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    {membership?.isLeader ? <Badge tone="primary">{t("leader")}</Badge> : null}
                    {membership?.positions.map((p) => (
                      <Badge key={p.id}>{p.name}</Badge>
                    ))}
                  </div>
                  <ContactLines entry={entry} labels={{ hiddenContact: t("hiddenContact") }} />
                  {manage ? (
                    <div>
                      <DeleteButton
                        name={`${entry.person.familyName} ${entry.person.givenName}`}
                        onDelete={removeTeamMember.bind(null, id, entry.person.id)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {manage ? (
          <div className="mt-4">
            <h3 className="mb-2 font-semibold">{t("form.addMember")}</h3>
            <EntityForm
              action={saveTeamMember.bind(null, id)}
              fields={memberFields}
              values={memberValues}
              submitLabel={t("form.add")}
              cancelHref={`/munkater/csapatok/${id}`}
              testId="member-form"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

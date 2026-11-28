import Link from "next/link";
import { Badge, PersonName, Stagger } from "@churchy/ui";
import { nameOf } from "@/components/workspace/person-card";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { loadDirectory } from "@/server/workspace-people";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.teams"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Csapatok* (D-51): the church's teams with their leaders and size. */
export default async function TeamsPage() {
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.teams")]);
  const [data, members] = await Promise.all([
    loadDirectory(env),
    env.repos.teams.listMembers(env.ctx, {}),
  ]);
  return (
    <div className="flex flex-col gap-5" data-testid="workspace-teams">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      {data.teams.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <Stagger as="ul" className="grid gap-3 md:grid-cols-2">
          {data.teams.map((team) => {
            const leaders = data.entries.filter((e) =>
              e.teams.some((m) => m.team.id === team.id && m.isLeader),
            );
            return (
              <li
                key={team.id}
                className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
                data-testid="team-card"
              >
                <Link
                  href={`/munkater/csapatok/${team.id}`}
                  className="inline-flex min-h-11 items-center font-heading text-fs-5 font-bold text-primary"
                >
                  {team.name}
                </Link>
                {team.description ? <p className="text-muted">{team.description}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {t("members", { count: members.filter((m) => m.teamId === team.id).length })}
                  </Badge>
                  {leaders.map((l) => (
                    <Badge key={l.person.id} tone="primary">
                      <PersonName name={nameOf(l.person)} titles={false} />
                    </Badge>
                  ))}
                </div>
              </li>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}

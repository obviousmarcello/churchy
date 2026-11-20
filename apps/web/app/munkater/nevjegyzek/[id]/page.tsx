import { notFound } from "next/navigation";
import { Badge, ButtonLink, PersonName } from "@churchy/ui";
import { ContactLines, nameOf } from "@/components/workspace/person-card";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { loadDirectory } from "@/server/workspace-people";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.directory"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** One person of the directory. A person the actor may not see looks like a missing page. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, env, t] = await Promise.all([params, getMemberEnv(), getT("munkater.directory")]);
  const data = await loadDirectory(env);
  const entry = data.entries.find((e) => e.person.id === id);
  if (!entry) notFound();
  const { person, teams } = entry;

  return (
    <div className="flex max-w-2xl flex-col gap-5" data-testid="workspace-person">
      <ButtonLink href="/munkater/nevjegyzek" variant="secondary" size="sm" className="self-start">
        {t("back")}
      </ButtonLink>
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          <PersonName name={nameOf(person)} />
        </h1>
        {person.roleTitle ? <p className="mt-1 text-fs-4 text-muted">{person.roleTitle}</p> : null}
      </header>
      {person.bio ? <p>{person.bio}</p> : null}
      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="font-heading text-fs-5 font-bold">
          {t("contact")}
        </h2>
        <ContactLines entry={entry} labels={{ hiddenContact: t("hiddenContact") }} />
        {entry.contact.email === null &&
        entry.contact.phone === null &&
        !entry.contact.hasHidden ? (
          <p className="text-muted">{t("noContact")}</p>
        ) : null}
      </section>
      {teams.length > 0 ? (
        <section aria-labelledby="teams-heading">
          <h2 id="teams-heading" className="font-heading text-fs-5 font-bold">
            {t("teams")}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {teams.map(({ team, isLeader, positions }) => (
              <li key={team.id} className="flex flex-wrap items-center gap-2">
                <a
                  href={`/munkater/csapatok/${team.id}`}
                  className="min-h-11 content-center font-semibold"
                >
                  {team.name}
                </a>
                {isLeader ? <Badge tone="primary">{t("leader")}</Badge> : null}
                {positions.map((p) => (
                  <Badge key={p.id}>{p.name}</Badge>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {person.skills.length > 0 ? (
        <section aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="font-heading text-fs-5 font-bold">
            {t("skill")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {person.skills.map((s) => (
              <li key={s}>
                <Badge>{s}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

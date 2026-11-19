import Link from "next/link";
import { Badge, Phone, PersonName } from "@churchy/ui";
import type { DirectoryEntry } from "@/server/workspace-people";

export interface PersonCardLabels {
  leader: string;
  hiddenContact: string;
  teams: string;
}

/** Name parts as `PersonName` wants them (nullable → absent). */
export function nameOf(person: DirectoryEntry["person"]) {
  return {
    prefix: person.prefix ?? undefined,
    familyName: person.familyName,
    givenName: person.givenName,
    suffix: person.suffix ?? undefined,
  };
}

/** The contact lines of a person: only what the viewer may see (decided by the loader). */
export function ContactLines({
  entry,
  labels,
}: {
  entry: DirectoryEntry;
  labels: Pick<PersonCardLabels, "hiddenContact">;
}) {
  const { contact } = entry;
  return (
    <div className="flex flex-col gap-1">
      {contact.phone ? (
        <Phone value={contact.phone} link className="min-h-11 content-center font-semibold" />
      ) : null}
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="min-h-11 content-center break-all font-semibold"
        >
          {contact.email}
        </a>
      ) : null}
      {contact.hasHidden ? (
        <span className="text-fs-2 text-muted">{labels.hiddenContact}</span>
      ) : null}
    </div>
  );
}

/** One person in the directory list. */
export function PersonCard({ entry, labels }: { entry: DirectoryEntry; labels: PersonCardLabels }) {
  const { person, teams } = entry;
  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-4"
      data-testid="directory-person"
    >
      <div>
        <Link
          href={`/munkater/nevjegyzek/${person.id}`}
          className="inline-flex min-h-11 items-center font-heading text-fs-5 font-bold text-primary"
        >
          <PersonName name={nameOf(person)} />
        </Link>
        {person.roleTitle ? <p className="text-muted">{person.roleTitle}</p> : null}
      </div>
      {teams.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={labels.teams}>
          {teams.map(({ team, isLeader, positions }) => (
            <li key={team.id}>
              <Badge tone={isLeader ? "primary" : "neutral"}>
                {[team.name, ...positions.map((p) => p.name)].join(" · ")}
                {isLeader ? ` (${labels.leader})` : ""}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <ContactLines entry={entry} labels={labels} />
    </li>
  );
}

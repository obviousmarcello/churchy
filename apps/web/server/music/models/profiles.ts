import "server-only";

import { formatPersonName } from "@churchy/hu";

import { getMemberEnv } from "@/server/workspace";
import { musicUserId } from "@/server/music/db";

// The people of the church that have a login (Churchy `people` with a `userId`), as the music
// models know users: their profile id and a name (Music Sheet DB `profiles.ts` listPeople).

export type PersonDTO = {
  /** The profile id, as the music tables store it. */
  id: string;
  name: string;
  /** Only with `emails: true`. */
  email: string | null;
};

/** The people with a login; `ids` limits them, `emails` adds their e-mail addresses. */
export async function listPeople(
  ids?: readonly string[],
  options: { emails?: boolean } = {},
): Promise<PersonDTO[]> {
  const { repos, ctx } = await getMemberEnv();
  const people = await repos.people.list(ctx);
  return people
    .flatMap((person) =>
      person.userId === null
        ? []
        : [
            {
              id: musicUserId(person.userId),
              email: options.emails ? person.email : null,
              name: formatPersonName({
                familyName: person.familyName,
                givenName: person.givenName,
                prefix: person.prefix ?? undefined,
                suffix: person.suffix ?? undefined,
              }),
            },
          ],
    )
    .filter((person) => ids === undefined || ids.includes(person.id))
    .toSorted((a, b) => a.name.localeCompare(b.name, "hu"));
}

/**
 * Name pools for generated demo volunteers. Every combination is fictitious — realistic
 * Hungarian family-first names, no real person is meant (CLAUDE.md rule 4).
 */
export const FAMILY_NAMES = [
  "Kovács",
  "Horváth",
  "Varga",
  "Tóth",
  "Szabó",
  "Nagy",
  "Szűcs",
  "Balogh",
  "Papp",
  "Takács",
  "Juhász",
  "Lakatos",
  "Mészáros",
  "Oláh",
  "Simon",
  "Rácz",
  "Fekete",
  "Szilágyi",
  "Török",
  "Fehér",
  "Gál",
  "Kis",
  "Szalai",
  "Magyar",
  "Orbán",
  "Gulyás",
  "Bíró",
  "Király",
  "Molnár",
  "Németh",
  "Farkas",
  "Hegedűs",
  "Boros",
  "Katona",
  "Sípos",
  "Illés",
  "Kelemen",
  "Lukács",
  "Pál",
  "Vincze",
  "Bálint",
  "Antal",
  "Fodor",
  "Pataki",
  "Somogyi",
  "Budai",
  "Szántó",
  "Barta",
  "Vass",
  "Csonka",
  "Jakab",
  "Fazekas",
  "Kocsis",
  "Halász",
  "Sándor",
  "Székely",
  "Lengyel",
  "Máté",
  "Bognár",
  "Deák",
];

export const FEMALE_GIVEN = [
  "Anna",
  "Éva",
  "Katalin",
  "Mária",
  "Zsuzsanna",
  "Erzsébet",
  "Judit",
  "Ilona",
  "Margit",
  "Ágnes",
  "Réka",
  "Eszter",
  "Júlia",
  "Orsolya",
  "Veronika",
  "Lilla",
  "Dóra",
  "Hanna",
  "Boglárka",
  "Nóra",
  "Klára",
  "Irén",
  "Edit",
  "Gabriella",
  "Mónika",
  "Tímea",
  "Szilvia",
  "Piroska",
  "Bernadett",
  "Emese",
];

export const MALE_GIVEN = [
  "István",
  "László",
  "József",
  "János",
  "Péter",
  "Pál",
  "Gábor",
  "Zoltán",
  "András",
  "Ferenc",
  "Tamás",
  "Miklós",
  "Gergely",
  "Balázs",
  "Dávid",
  "Ádám",
  "Bence",
  "Márton",
  "Levente",
  "Csaba",
  "Attila",
  "Sándor",
  "Lajos",
  "Imre",
  "Dániel",
  "Máté",
  "Barnabás",
  "Kristóf",
  "Benedek",
  "Domonkos",
];

/** Deterministic name for the `i`-th (1-based) generated person of a church. */
export function pooledName(
  i: number,
  offset: number,
  taken: Set<string>,
): { family: string; given: string } {
  const female = i % 2 === 0;
  const givenPool = female ? FEMALE_GIVEN : MALE_GIVEN;
  const given = givenPool[(i * 11 + offset * 3) % givenPool.length] as string;
  let fi = (i * 7 + offset) % FAMILY_NAMES.length;
  for (;;) {
    const family = FAMILY_NAMES[fi] as string;
    const key = `${family} ${given}`;
    if (!taken.has(key)) {
      taken.add(key);
      return { family, given };
    }
    fi = (fi + 1) % FAMILY_NAMES.length;
  }
}

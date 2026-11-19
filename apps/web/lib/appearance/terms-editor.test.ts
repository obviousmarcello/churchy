import { describe, expect, it } from "vitest";
import { draftFromForms, formsFromDraft, suggestions, termProblem } from "./terms-editor";

const draft = {
  nom: "Istentiszteleti rend",
  plural: "",
  slug: "istentiszteleti-rend",
  article: "az",
} as const;

describe("terms editor", () => {
  it("stores the grammatical forms, not derived text", () => {
    expect(formsFromDraft({ ...draft, plural: " rendek " })).toEqual({
      nom: "Istentiszteleti rend",
      lower: "istentiszteleti rend",
      slug: "istentiszteleti-rend",
      article: "az",
      plural: "rendek",
    });
    expect(formsFromDraft(draft)).not.toHaveProperty("plural");
    expect(draftFromForms(formsFromDraft(draft))).toEqual(draft);
  });

  it("suggests slug and article from the name", () => {
    expect(suggestions("Alkalmak és órák")).toEqual({ slug: "alkalmak-es-orak", article: "az" });
    expect(suggestions("Miserend")).toEqual({ slug: "miserend", article: "a" });
  });

  it("refuses an empty name, a bad slug and a slug in use", () => {
    expect(termProblem(draft, {})).toBeNull();
    expect(termProblem({ ...draft, nom: " " }, {})).toBe("nom");
    expect(termProblem({ ...draft, slug: "Nagy Betű" }, {})).toBe("slug");
    expect(termProblem(draft, { "istentiszteleti-rend": "serviceSchedule" })).toBe("slugTaken");
  });
});

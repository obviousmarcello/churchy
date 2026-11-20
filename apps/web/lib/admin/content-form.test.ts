import { describe, expect, it } from "vitest";
import { AnnouncementInputSchema, conflict, notFound, validationError } from "@churchy/contracts";
import {
  formValues,
  issueErrors,
  repositoryErrors,
  validate,
  type ErrorMessages,
} from "./content-form";

const messages: ErrorMessages = {
  required: "kötelező",
  slugTaken: "foglalt",
  slugFormat: "formátum",
  sunday: "vasárnap",
  weekTaken: "hét foglalt",
  announcementEmpty: "üres",
  endBeforeStart: "korábbi vég",
  phone: "telefon",
  postalCode: "irányítószám",
  address: "cím",
  notFound: "nincs",
  general: "hiba",
};

describe("validate", () => {
  it("maps contract issues to form fields with Hungarian messages", () => {
    const result = validate(
      AnnouncementInputSchema,
      { weekSunday: "2027-06-14", body: null },
      ["weekSunday", "body"],
      messages,
    );
    expect(result).toEqual({
      ok: false,
      errors: { weekSunday: "vasárnap", body: "üres" },
    });
  });

  it("accepts valid input", () => {
    const result = validate(
      AnnouncementInputSchema,
      { weekSunday: "2027-06-13", body: { type: "doc", content: [] } },
      ["weekSunday", "body"],
      messages,
    );
    expect(result.ok).toBe(true);
  });
});

describe("repositoryErrors", () => {
  it("turns conflicts, validation and missing items into field errors", () => {
    const fields = ["slug", "weekSunday"];
    expect(repositoryErrors(conflict("x", { field: "slug" }), fields, messages)).toEqual({
      slug: "foglalt",
    });
    expect(repositoryErrors(conflict("x", { field: "weekSunday" }), fields, messages)).toEqual({
      weekSunday: "hét foglalt",
    });
    expect(
      repositoryErrors(
        validationError([{ path: ["slug"], message: "Expected a lowercase slug" }]),
        fields,
        messages,
      ),
    ).toEqual({ slug: "formátum" });
    expect(repositoryErrors(notFound("Post", "x"), fields, messages)).toEqual({ _form: "nincs" });
  });

  it("rethrows unknown errors", () => {
    expect(() => repositoryErrors(new Error("boom"), [], messages)).toThrow("boom");
  });
});

describe("issueErrors / formValues", () => {
  it("keeps the first message per field and files the rest under _form", () => {
    expect(
      issueErrors(
        [
          { path: ["title"], message: "a" },
          { path: ["title"], message: "b" },
          { path: ["other"], message: "c" },
        ],
        ["title"],
        messages,
      ),
    ).toEqual({ title: "a", _form: "c" });
  });

  it("reads strings and blanks everything else", () => {
    const form = new FormData();
    form.set("title", "Cím");
    expect(formValues(form, ["title", "slug"])).toEqual({ title: "Cím", slug: "" });
  });
});

import { describe, expect, it } from "vitest";
import type { FormField } from "@churchy/contracts";
import {
  displayValue,
  fieldErrors,
  fieldName,
  firstErrorStep,
  readSubmission,
  splitSteps,
} from "./form";
import { createRateLimiter } from "./rate-limit";

const base = { required: false, help: null };
const fields: FormField[] = [
  { ...base, type: "text", key: "contactName", label: "Név", required: true },
  { ...base, type: "email", key: "email", label: "E-mail", required: true },
  { ...base, type: "date", key: "when", label: "Mikor" },
  { ...base, type: "checkbox", key: "agree", label: "Egyetért" },
  {
    ...base,
    type: "select",
    key: "pick",
    label: "Választás",
    multiple: true,
    options: [
      { value: "a", label: "Első" },
      { value: "b", label: "Második" },
    ],
  },
  { ...base, type: "file", key: "doc", label: "Irat", maxBytes: 10 },
];

function form(entries: [string, unknown][]) {
  return {
    get: (n: string) => entries.find(([k]) => k === n)?.[1] ?? null,
    getAll: (n: string) => entries.filter(([k]) => k === n).map(([, v]) => v),
  };
}
const messages = { required: "Kötelező", invalid: "Hibás", tooLarge: "Nagy" };

describe("readSubmission", () => {
  it("reads every field type and drops empty values", () => {
    const sub = readSubmission(
      fields,
      form([
        [fieldName("contactName"), "  Minta Anna "],
        [fieldName("email"), "anna@example.test"],
        [fieldName("when"), ""],
        [fieldName("agree"), "on"],
        [fieldName("pick"), "a"],
        [fieldName("pick"), "b"],
        [fieldName("doc"), { name: "irat.pdf", size: 5 }],
      ]),
    );
    expect(sub.data).toEqual({
      contactName: "Minta Anna",
      email: "anna@example.test",
      agree: true,
      pick: ["a", "b"],
      doc: "irat.pdf",
    });
    expect(sub.values.when).toBe("");
    expect(fieldErrors(fields, sub, messages)).toEqual({});
  });

  it("reports missing, invalid and oversized values in Hungarian", () => {
    const sub = readSubmission(
      fields,
      form([
        [fieldName("email"), "nem-email"],
        [fieldName("doc"), { name: "nagy.pdf", size: 11 }],
      ]),
    );
    expect(fieldErrors(fields, sub, messages)).toEqual({
      contactName: "Kötelező",
      email: "Hibás",
      doc: "Nagy",
    });
  });
});

describe("steps", () => {
  it("splits contact fields from the rest and finds the first step with an error", () => {
    const steps = splitSteps(fields);
    expect(steps.map((s) => [s.id, s.fields.map((f) => f.key)])).toEqual([
      ["contact", ["contactName", "email"]],
      ["details", ["when", "agree", "pick", "doc"]],
    ]);
    expect(firstErrorStep(steps, { pick: "x" })).toBe(1);
    expect(firstErrorStep(steps, {})).toBe(0);
    expect(splitSteps(fields.slice(2)).map((s) => s.id)).toEqual(["details"]);
  });
});

describe("displayValue", () => {
  const labels = { yes: "Igen", no: "Nem", none: "–" };
  it("shows option labels, booleans and empty values", () => {
    expect(displayValue(fields[4]!, ["a", "b"], labels)).toBe("Első, Második");
    expect(displayValue(fields[3]!, true, labels)).toBe("Igen");
    expect(displayValue(fields[3]!, undefined, labels)).toBe("Nem");
    expect(displayValue(fields[0]!, undefined, labels)).toBe("–");
  });
});

describe("rate limiter", () => {
  it("allows five per hour and key, then recovers", () => {
    const limiter = createRateLimiter();
    const hour = 3_600_000;
    for (let i = 0; i < 5; i += 1) expect(limiter.take("t|ip", i * 1000)).toBe(true);
    expect(limiter.take("t|ip", 6000)).toBe(false);
    expect(limiter.take("t|other", 6000)).toBe(true);
    expect(limiter.remaining("t|ip", 6000)).toBe(0);
    expect(limiter.take("t|ip", hour + 1)).toBe(true);
  });
});

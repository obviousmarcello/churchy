import { describe, expect, it } from "vitest";
import type { FormField } from "@churchy/contracts";
import {
  draftsFromFields,
  fieldFromDraft,
  newDraft,
  nextFieldKey,
  parseBuilder,
  splitEmails,
  type BuilderMessages,
  type BuilderValues,
} from "./builder";

const messages: BuilderMessages = {
  title: "title",
  key: "key",
  keyTaken: "keyTaken",
  prefix: "prefix",
  emails: "emails",
  retention: "retention",
  fieldLabel: "fieldLabel",
  fieldKey: "fieldKey",
  fieldKeyTaken: "fieldKeyTaken",
  options: "options",
  general: "general",
};

const draft = (over: Record<string, unknown> = {}) => ({
  ...newDraft([]),
  key: "nev",
  label: "Név",
  ...over,
});

function values(fields: unknown[], over: Partial<BuilderValues> = {}): BuilderValues {
  return {
    title: "Teszt űrlap",
    key: "teszt",
    referencePrefix: "TES",
    notifyEmails: "iroda@example.test, plebania@example.test",
    confirmationText: "Köszönjük.",
    retentionDays: "365",
    active: "on",
    fieldsJson: JSON.stringify(fields),
    ...over,
  };
}

describe("parseBuilder", () => {
  it("builds a form definition from the submission", () => {
    const result = parseBuilder(
      values([
        draft({ required: true }),
        draft({ key: "valasz", label: "Válasz", type: "select", optionsText: "Igen\nNem\nIgen" }),
      ]),
      null,
      [],
      messages,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toMatchObject({
      key: "teszt",
      notifyEmails: ["iroda@example.test", "plebania@example.test"],
      retentionDays: 365,
      active: true,
    });
    expect(result.input.fields[1]).toMatchObject({
      type: "select",
      options: [
        { value: "Igen", label: "Igen" },
        { value: "Nem", label: "Nem" },
      ],
    });
  });

  it("reports every problem with its own message", () => {
    const result = parseBuilder(
      values(
        [
          draft({ label: "" }),
          draft({ key: "x y" }),
          draft(),
          draft(),
          draft({ key: "v", type: "select" }),
        ],
        {
          title: " ",
          key: "Rossz Kulcs",
          referencePrefix: "k",
          notifyEmails: "nem-email",
          retentionDays: "0",
        },
      ),
      null,
      [],
      messages,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "title",
        key: "key",
        referencePrefix: "prefix",
        notifyEmails: "emails",
        retentionDays: "retention",
        "field.0": "fieldLabel",
        "field.1": "fieldKey",
        "field.2": "fieldKeyTaken",
        "field.3": "fieldKeyTaken",
        "field.4": "options",
      },
    });
  });

  it("keeps the key of a saved form and refuses a key another form uses", () => {
    const saved = parseBuilder(
      values([], { key: "masik" }),
      { id: "f1", key: "teszt" },
      [],
      messages,
    );
    expect(saved.ok && saved.input).toMatchObject({ id: "f1", key: "teszt" });
    expect(parseBuilder(values([]), null, ["teszt"], messages)).toEqual({
      ok: false,
      errors: { key: "keyTaken" },
    });
  });
});

describe("drafts", () => {
  it("round-trips fields and numbers new keys", () => {
    const fields: FormField[] = [
      { type: "text", key: "mezo1", label: "A", required: true, help: "Súgó" },
      {
        type: "select",
        key: "v",
        label: "V",
        required: false,
        help: null,
        multiple: true,
        options: [{ value: "x", label: "x" }],
      },
    ];
    const drafts = draftsFromFields(fields);
    expect(drafts.map((d) => fieldFromDraft(d))).toEqual(fields);
    expect(nextFieldKey(drafts)).toBe("mezo3");
    expect(newDraft(drafts).isNew).toBe(true);
  });

  it("splits e-mail lists", () => {
    expect(splitEmails("a@x.hu; b@x.hu\nc@x.hu")).toEqual(["a@x.hu", "b@x.hu", "c@x.hu"]);
  });
});

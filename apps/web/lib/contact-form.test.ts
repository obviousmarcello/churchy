import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, contactValues, isBot, parseContactForm } from "./contact-form";

const MESSAGES = { required: "KÖTELEZŐ", phone: "TELEFON", consent: "HOZZÁJÁRULÁS" };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

const VALID = {
  name: "Minta Mária",
  email: " minta.maria@example.test ",
  phone: "",
  subject: "Érdeklődés",
  message: "Szeretnék érdeklődni a hittanórákról.",
  consent: "on",
};

describe("contact form parsing", () => {
  it("accepts a valid form and normalises it", () => {
    const result = parseContactForm(contactValues(form(VALID)), MESSAGES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toMatchObject({
      email: "minta.maria@example.test",
      phone: "",
      consent: true,
    });
  });

  it("reports every missing field in Hungarian and keeps what was typed", () => {
    const result = parseContactForm(
      contactValues(form({ name: "", email: "", subject: " ", message: "", phone: "" })),
      MESSAGES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      name: "KÖTELEZŐ",
      email: "KÖTELEZŐ",
      subject: "KÖTELEZŐ",
      message: "KÖTELEZŐ",
      consent: "HOZZÁJÁRULÁS",
    });
    expect(result.values.subject).toBe(" ");
  });

  it("uses the Hungarian Zod messages for format and length errors", () => {
    const result = parseContactForm(
      contactValues(form({ ...VALID, email: "nem-email", message: "rövid", phone: "abc" })),
      MESSAGES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBe("Adjon meg érvényes e-mail-címet.");
    expect(result.errors.message).toBe("Legalább 10 karakter szükséges.");
    expect(result.errors.phone).toBe("TELEFON");
    expect(result.errors.name).toBeUndefined();
  });

  it("recognises a filled honeypot", () => {
    expect(isBot(form(VALID))).toBe(false);
    expect(isBot(form({ ...VALID, [HONEYPOT_FIELD]: "  " }))).toBe(false);
    expect(isBot(form({ ...VALID, [HONEYPOT_FIELD]: "https://spam.example" }))).toBe(true);
  });

  it("treats a missing consent box and non-string values as empty", () => {
    const values = contactValues({ get: (name) => (name === "name" ? 42 : null) });
    expect(values).toEqual({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
      consent: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  MNB_QR_FIELD_COUNT,
  MNB_QR_MAX_LENGTH,
  isValidBic,
  mnbQrPayload,
  mnbQrValidity,
  type MnbQrInput,
} from "./index";

/**
 * MNB QR-kód szabvány, version 001 (see `mnb-qr.ts`): 17 LF-terminated fields, `HCT`, UTF-8,
 * BIC, name ≤ 70, IBAN, `HUF<amount>`, `yyyyMMddHHmmss±z`, purpose, közlemény ≤ 70, 7 ids ≤ 35.
 * The account number below is the well-known sample account of Hungarian IBAN documentation,
 * not a church's or a person's.
 */

const BASE: MnbQrInput = {
  bic: "OTPVHUHB",
  name: "Szent Tivadar Plébánia",
  account: "11773016-11111018-00000000",
  // 2026-12-31 23:59:59 in Budapest (CET, UTC+1).
  validUntil: new Date("2026-12-31T22:59:59Z"),
  reference: "Egyházi hozzájárulás",
};

const fieldsOf = (payload: string) => payload.split("\n").slice(0, -1);

describe("mnbQrPayload", () => {
  it("builds the 17 fields in spec order, each terminated by LF", () => {
    const payload = mnbQrPayload(BASE);
    expect(payload).toBe(
      [
        "HCT",
        "001",
        "1",
        "OTPVHUHB",
        "Szent Tivadar Plébánia",
        "HU42117730161111101800000000",
        "",
        "20261231235959+1",
        "",
        "Egyházi hozzájárulás",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]
        .map((f) => `${f}\n`)
        .join(""),
    );
    expect(payload.endsWith("\n")).toBe(true);
    expect(fieldsOf(payload)).toHaveLength(MNB_QR_FIELD_COUNT);
  });

  it("writes the amount as HUF + whole forints, and the optional purpose code", () => {
    const fields = fieldsOf(mnbQrPayload({ ...BASE, amountHuf: 5000, purpose: "dona" }));
    expect(fields[6]).toBe("HUF5000");
    expect(fields[8]).toBe("DONA");
  });

  it("accepts an IBAN (with spaces) or a 16-digit account and writes a compact IBAN", () => {
    expect(
      fieldsOf(mnbQrPayload({ ...BASE, account: "HU42 1177 3016 1111 1018 0000 0000" }))[5],
    ).toBe("HU42117730161111101800000000");
    expect(fieldsOf(mnbQrPayload({ ...BASE, account: "11773016-11111018" }))[5]).toBe(
      "HU42117730161111101800000000",
    );
  });

  it("normalises the BIC and accepts the 11-character form", () => {
    expect(fieldsOf(mnbQrPayload({ ...BASE, bic: "otpv hu hb xxx" }))[3]).toBe("OTPVHUHBXXX");
  });

  it("cuts name and közlemény at 70 characters and keeps each field on one line", () => {
    const long = "Á".repeat(80);
    const fields = fieldsOf(
      mnbQrPayload({ ...BASE, name: long, reference: "Első sor\nmásodik\tsor  " }),
    );
    expect(Array.from(fields[4]!)).toHaveLength(70);
    expect(fields[9]).toBe("Első sor második sor");
    expect(fields).toHaveLength(MNB_QR_FIELD_COUNT);
  });

  it("puts identifiers 11–17 in spec order, each cut at 35 characters", () => {
    const fields = fieldsOf(
      mnbQrPayload({ ...BASE, ids: { shop: "S1", navCode: "N".repeat(40), invoice: "INV-1" } }),
    );
    expect(fields.slice(10)).toEqual(["S1", "", "INV-1", "", "", "", "N".repeat(35)]);
  });

  it("leaves an omitted közlemény empty", () => {
    const { reference: _omit, ...rest } = BASE;
    expect(fieldsOf(mnbQrPayload(rest))[9]).toBe("");
  });

  it("rejects invalid mandatory fields and malformed optional ones", () => {
    expect(() => mnbQrPayload({ ...BASE, bic: "OTP" })).toThrow(RangeError);
    expect(() => mnbQrPayload({ ...BASE, name: " \n " })).toThrow(/name/);
    expect(() => mnbQrPayload({ ...BASE, account: "123" })).toThrow(/account/);
    expect(() => mnbQrPayload({ ...BASE, account: "HU00 1177 3016 1111 1018 0000 0000" })).toThrow(
      /account/,
    );
    expect(() => mnbQrPayload({ ...BASE, account: "DE89370400440532013000" })).toThrow(/account/);
    expect(() => mnbQrPayload({ ...BASE, amountHuf: 0 })).toThrow(/Amount/);
    expect(() => mnbQrPayload({ ...BASE, amountHuf: 10.5 })).toThrow(/Amount/);
    expect(() => mnbQrPayload({ ...BASE, amountHuf: 1e12 })).toThrow(/Amount/);
    expect(() => mnbQrPayload({ ...BASE, purpose: "ABCDE" })).toThrow(/purpose/);
    expect(() => mnbQrPayload({ ...BASE, validUntil: new Date(Number.NaN) })).toThrow(/validity/);
  });

  it("refuses payloads over the 345-character limit", () => {
    const id = "X".repeat(35);
    expect(() =>
      mnbQrPayload({
        ...BASE,
        name: "N".repeat(70),
        reference: "R".repeat(70),
        ids: { shop: id, device: id, invoice: id, customer: id, transfer: id, loyalty: id },
      }),
    ).toThrow(/345/);
    expect(MNB_QR_MAX_LENGTH).toBe(345);
  });
});

describe("mnbQrValidity", () => {
  it("formats Budapest wall-clock time with the CET / CEST offset", () => {
    expect(mnbQrValidity(new Date("2026-01-15T11:00:00Z"))).toBe("20260115120000+1");
    expect(mnbQrValidity(new Date("2026-07-01T10:30:05Z"))).toBe("20260701123005+2");
  });

  it("follows the DST switch in Budapest, not the process time zone", () => {
    // 2026-03-29 01:59:59 UTC = 03:59:59 CEST; one second before the switch is 01:59:59 CET.
    expect(mnbQrValidity(new Date("2026-03-29T00:59:59Z"))).toBe("20260329015959+1");
    expect(mnbQrValidity(new Date("2026-03-29T01:00:00Z"))).toBe("20260329030000+2");
  });

  it("drops milliseconds", () => {
    expect(mnbQrValidity(new Date("2026-01-15T11:00:00.999Z"))).toBe("20260115120000+1");
  });
});

describe("isValidBic", () => {
  it("accepts 8- and 11-character BICs only", () => {
    expect(isValidBic("OTPVHUHB")).toBe(true);
    expect(isValidBic("giba hu hb xxx")).toBe(true);
    expect(isValidBic("OTPVHUH")).toBe(false);
    expect(isValidBic("1TPVHUHB")).toBe(false);
  });
});

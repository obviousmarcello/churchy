import { describe, expect, it } from "vitest";
import { MNB_QR_FIELD_COUNT } from "@churchy/hu";
import { QR_VALIDITY_DAYS, qrSvg, supportDetails } from "./giving";

/** Fictitious giving data (bank code 999 is no real bank). */
const GIVING = {
  accountName: "Minta Egyházközség",
  accountNumber: "99999999-11111111-00000001",
  bic: "DEMOHUHB",
  reference: "Adomány",
  szja1TechnicalNumber: "DEMO-0001",
  foundationTaxNumber: "19999999-1-13",
  showQr: true,
};
const NOW = new Date("2026-11-14T10:00:00Z");

describe("supportDetails", () => {
  it("normalises the account, derives the IBAN and builds the MNB QR payload", () => {
    const d = supportDetails(GIVING, "Minta", NOW);
    expect(d).toMatchObject({
      accountName: "Minta Egyházközség",
      accountNumber: "99999999-11111111-00000001",
      reference: "Adomány",
      technicalNumber: "DEMO-0001",
      foundationTaxNumber: "19999999-1-13",
    });
    expect(d.iban).toMatch(/^HU\d{26}$/);
    const fields = d.qrPayload!.split("\n").slice(0, -1);
    expect(fields).toHaveLength(MNB_QR_FIELD_COUNT);
    expect(fields.slice(0, 6)).toEqual([
      "HCT",
      "001",
      "1",
      "DEMOHUHB",
      "Minta Egyházközség",
      d.iban,
    ]);
    expect(fields[6]).toBe(""); // the donor enters the amount
    expect(fields[9]).toBe("Adomány");
    expect(d.qrValidUntil?.getTime()).toBe(NOW.getTime() + QR_VALIDITY_DAYS * 86_400_000);
    // 2027-11-14 11:00 Budapest (CET).
    expect(fields[7]).toBe("20271114110000+1");
  });

  it("falls back to the church name and accepts an IBAN-only account", () => {
    const d = supportDetails(
      { iban: "HU42117730161111101800000000", bic: "OTPVHUHB", showQr: true },
      "Minta Plébánia",
      NOW,
    );
    expect(d.accountName).toBe("Minta Plébánia");
    expect(d.accountNumber).toBe("11773016-11111018-00000000");
    expect(d.reference).toBeNull();
    expect(d.qrPayload?.split("\n")[9]).toBe("");
  });

  it("shows no QR code when it is off, the BIC is missing or the data is invalid", () => {
    expect(supportDetails({ ...GIVING, showQr: false }, "M", NOW).qrPayload).toBeNull();
    const { bic: _bic, ...noBic } = GIVING;
    expect(supportDetails(noBic, "M", NOW).qrPayload).toBeNull();
    const invalid = supportDetails({ ...GIVING, bic: "X" }, "M", NOW);
    expect(invalid.qrPayload).toBeNull();
    expect(invalid.qrValidUntil).toBeNull();
    expect(invalid.accountNumber).toBe(GIVING.accountNumber);
  });

  it("reports missing details as null", () => {
    expect(supportDetails({ reference: "  " }, " ", NOW)).toEqual({
      accountName: null,
      accountNumber: null,
      iban: null,
      reference: null,
      technicalNumber: null,
      foundationTaxNumber: null,
      qrPayload: null,
      qrValidUntil: null,
    });
  });
});

describe("qrSvg", () => {
  it("encodes the payload as a square QR code with a 4-module quiet zone", () => {
    const payload = supportDetails(GIVING, "M", NOW).qrPayload!;
    const { size, path } = qrSvg(payload);
    const modules = size - 8;
    // QR versions are 21, 25, 29 … modules wide.
    expect((modules - 17) % 4).toBe(0);
    expect(modules).toBeGreaterThanOrEqual(21);
    // The top-left finder pattern starts right after the quiet zone: a run of 7 dark modules.
    expect(path.startsWith("M4 4h7v1h-7z")).toBe(true);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
  });

  it("is deterministic", () => {
    expect(qrSvg("HCT\n")).toEqual(qrSvg("HCT\n"));
  });
});

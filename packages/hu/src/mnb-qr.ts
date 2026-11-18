import { bankAccountToIban, isValidIban } from "./bank";

/**
 * Payload of the MNB instant-payment QR code (*azonnali fizetés QR-kód*, PRD FR-015, SDD §7.5).
 *
 * Spec: Magyar Nemzeti Bank, *„Az azonnali átutalási rendszer QR-kód alapú fizetési
 * megoldásaihoz kapcsolódó szabvány”* (QR-kód szabvány, version 001), which defines the data
 * content shown here. Summary of the rules implemented:
 *
 * - The payload is **17 fields in a fixed order**, each terminated by a line feed (LF, `0x0A`).
 *   An optional field that is not used is an empty line, so the field count never changes.
 * - Character set field `1` means UTF-8; the QR code is encoded in byte mode with error
 *   correction level **M**; the whole payload is at most **345 characters**.
 * - Fields (length; M = mandatory, O = optional):
 *    1. Identification code — `HCT` (credit transfer order) or `RTP` (request to pay); 3; M
 *    2. Version — `001`; 3; M
 *    3. Character set — `1` (UTF-8); 1; M
 *    4. Beneficiary's BIC — 8 or 11; M
 *    5. Beneficiary's name — ≤ 70; M
 *    6. Beneficiary's IBAN — 28 (`HU…`); M
 *    7. Amount — `HUF` + ≤ 12 digits, integer forints; O for `HCT`
 *    8. Validity — `yyyyMMddHHmmss` + `+`/`-` + one-digit UTC offset in hours (`+1` CET, `+2`
 *       CEST), 16 characters; M
 *    9. Payment situation identifier (purpose code) — 4; O
 *   10. Remittance information (*közlemény*) — ≤ 70; O
 *   11. Shop ID; 12. Merchant device ID; 13. Invoice / receipt ID; 14. Customer ID;
 *   15. Credit transfer (merchant-internal transaction) ID; 16. Loyalty ID; 17. NAV verification
 *       code — each ≤ 35; O
 *
 * A church's donation code is a `HCT` without amount: the donor's banking app opens a prefilled
 * transfer and the donor types the amount. Only `HCT` is produced (`RTP` needs the beneficiary
 * bank's request-to-pay service). The D-17 manual check scans the code in two Hungarian banking
 * apps before real data is used.
 *
 * Pure: no I/O, no clock (the validity instant is an input), no locale or process time zone.
 */

/** Maximum payload length (characters) allowed by the spec. */
export const MNB_QR_MAX_LENGTH = 345;
/** Number of fields in a version-001 payload. */
export const MNB_QR_FIELD_COUNT = 17;
/** Error correction level the spec requires. */
export const MNB_QR_ERROR_CORRECTION = "M" as const;

const NAME_MAX = 70;
const REFERENCE_MAX = 70;
const ID_MAX = 35;
const AMOUNT_MAX = 999_999_999_999;
const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const PURPOSE = /^[A-Z0-9]{4}$/;

export interface MnbQrInput {
  /** Beneficiary bank's BIC (SWIFT code), 8 or 11 characters. */
  bic: string;
  /** Beneficiary's name (longer names are cut at 70 characters). */
  name: string;
  /** Beneficiary's Hungarian IBAN, or the domestic 16/24-digit account number (converted). */
  account: string;
  /** Amount in forints; omitted for a donation (the payer enters it). */
  amountHuf?: number;
  /** Until when banking apps accept the code. */
  validUntil: Date;
  /** Purpose code (*fizetési helyzet azonosító*), 4 characters. */
  purpose?: string;
  /** Remittance information (*közlemény*), cut at 70 characters. */
  reference?: string;
  /** Optional identifiers of fields 11–17, in spec order (each cut at 35 characters). */
  ids?: Partial<Record<MnbQrIdField, string>>;
}

export type MnbQrIdField =
  "shop" | "device" | "invoice" | "customer" | "transfer" | "loyalty" | "navCode";

const ID_FIELDS: readonly MnbQrIdField[] = [
  "shop",
  "device",
  "invoice",
  "customer",
  "transfer",
  "loyalty",
  "navCode",
];

/** One line of text: line breaks and other control characters become spaces, then trimmed. */
function field(value: string | undefined, max: number): string {
  if (value === undefined) return "";
  // Control characters (LF above all) would break the line format.
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  const controls = /[\u0000-\u001f\u007f]+/g;
  const single = value.replace(controls, " ").replace(/\s+/g, " ").trim();
  return Array.from(single).slice(0, max).join("").trim();
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Field 8: the instant as Europe/Budapest wall-clock time with its UTC offset, e.g.
 * `20261231235959+1` (CET) or `20260701120000+2` (CEST).
 */
export function mnbQrValidity(instant: Date): string {
  const ms = instant.getTime();
  if (!Number.isFinite(ms)) throw new RangeError("Invalid validity date");
  const parts: Record<string, number> = {};
  for (const p of BUDAPEST_PARTS.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const wall = Date.UTC(
    parts["year"]!,
    parts["month"]! - 1,
    parts["day"]!,
    parts["hour"]!,
    parts["minute"]!,
    parts["second"]!,
  );
  const offset = Math.round((wall - Math.floor(ms / 1000) * 1000) / 3_600_000);
  return (
    `${pad(parts["year"]!, 4)}${pad(parts["month"]!)}${pad(parts["day"]!)}` +
    `${pad(parts["hour"]!)}${pad(parts["minute"]!)}${pad(parts["second"]!)}` +
    `${offset < 0 ? "-" : "+"}${Math.abs(offset)}`
  );
}

const BUDAPEST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Budapest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The IBAN for field 6, from an IBAN or a domestic account number; null if neither is valid. */
function ibanOf(account: string): string | null {
  const compact = account.replace(/\s/g, "").toUpperCase();
  if (compact.startsWith("HU")) return isValidIban(compact) ? compact : null;
  return bankAccountToIban(account)?.replace(/\s/g, "") ?? null;
}

/**
 * Builds the version-001 `HCT` payload. Throws a `RangeError` when a mandatory field is missing
 * or invalid (BIC, name, IBAN, validity) or an optional one is malformed (amount, purpose code).
 */
export function mnbQrPayload(input: MnbQrInput): string {
  const bic = input.bic.replace(/\s/g, "").toUpperCase();
  if (!BIC.test(bic)) throw new RangeError("Invalid BIC");
  const name = field(input.name, NAME_MAX);
  if (name === "") throw new RangeError("Beneficiary name is required");
  const iban = ibanOf(input.account);
  if (iban === null || !iban.startsWith("HU")) throw new RangeError("Invalid Hungarian account");

  let amount = "";
  if (input.amountHuf !== undefined) {
    const value = input.amountHuf;
    if (!Number.isInteger(value) || value < 1 || value > AMOUNT_MAX) {
      throw new RangeError("Amount must be a whole number of forints (1 … 999 999 999 999)");
    }
    amount = `HUF${value}`;
  }

  const purpose = input.purpose?.trim().toUpperCase() ?? "";
  if (purpose !== "" && !PURPOSE.test(purpose)) throw new RangeError("Invalid purpose code");

  const fields = [
    "HCT",
    "001",
    "1",
    bic,
    name,
    iban,
    amount,
    mnbQrValidity(input.validUntil),
    purpose,
    field(input.reference, REFERENCE_MAX),
    ...ID_FIELDS.map((key) => field(input.ids?.[key], ID_MAX)),
  ];
  const payload = fields.map((f) => `${f}\n`).join("");
  if (Array.from(payload).length > MNB_QR_MAX_LENGTH) {
    throw new RangeError("Payload longer than 345 characters");
  }
  return payload;
}

/** `true` for a syntactically valid BIC (8 or 11 characters). */
export function isValidBic(input: string): boolean {
  return BIC.test(input.replace(/\s/g, "").toUpperCase());
}

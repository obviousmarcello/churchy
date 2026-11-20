import type { SiteConfig } from "@churchy/contracts";
import {
  MNB_QR_ERROR_CORRECTION,
  bankAccountToIban,
  ibanToBankAccount,
  mnbQrPayload,
  normalizeBankAccount,
} from "@churchy/hu";
import { encode } from "uqr";

/**
 * Support page data (FR-015, SDD §7.5, D-17): the church's account, payment reference, 1 %
 * numbers and the instant-payment QR code. Pure, so it is unit tested; the page only renders it.
 */

/** How long a generated QR code stays valid in banking apps (field 8 of the MNB payload). */
export const QR_VALIDITY_DAYS = 365;

export interface SupportDetails {
  accountName: string | null;
  /** Domestic 8-8-8 (or 8-8) account number, or null when none is set. */
  accountNumber: string | null;
  /** The account's IBAN (compact), when it can be derived. */
  iban: string | null;
  reference: string | null;
  /** *Technikai szám* of the denomination for the church 1 % (SZJA 1+1 %). */
  technicalNumber: string | null;
  /** Tax number of the church's foundation for the civil 1 %. */
  foundationTaxNumber: string | null;
  /** MNB QR payload, or null when the QR code is off or a mandatory field is missing. */
  qrPayload: string | null;
  /** Until when banking apps accept the QR code (null without one). */
  qrValidUntil: Date | null;
}

const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Support details from the effective `giving` config; `now` sets the QR code's validity. */
export function supportDetails(
  giving: Partial<SiteConfig["giving"]>,
  churchName: string,
  now: Date,
): SupportDetails {
  const accountNumber =
    (giving.accountNumber ? normalizeBankAccount(giving.accountNumber) : null) ??
    (giving.iban ? ibanToBankAccount(giving.iban) : null);
  const iban =
    giving.iban ?? (accountNumber ? bankAccountToIban(accountNumber)?.replace(/\s/g, "") : null);
  const accountName = blank(giving.accountName) ?? blank(churchName);
  const reference = blank(giving.reference);

  let qrPayload: string | null = null;
  const validUntil = new Date(now.getTime() + QR_VALIDITY_DAYS * 86_400_000);
  if (giving.showQr && giving.bic && accountNumber && accountName) {
    try {
      qrPayload = mnbQrPayload({
        bic: giving.bic,
        name: accountName,
        account: iban ?? accountNumber,
        validUntil,
        ...(reference ? { reference } : {}),
      });
    } catch {
      // Invalid stored data: the page shows the account details without a QR code.
      qrPayload = null;
    }
  }

  return {
    accountName,
    accountNumber,
    iban: iban ?? null,
    reference,
    technicalNumber: blank(giving.szja1TechnicalNumber),
    foundationTaxNumber: blank(giving.foundationTaxNumber),
    qrPayload,
    qrValidUntil: qrPayload === null ? null : validUntil,
  };
}

export interface QrSvg {
  /** Side length in modules, quiet zone included. */
  size: number;
  /** SVG path (`M x y h1 v1 h-1 z …`) of the dark modules, in module units. */
  path: string;
}

/** Quiet zone of 4 modules on every side (ISO/IEC 18004). */
const QUIET_ZONE = 4;

/**
 * Encodes the payload as a QR code (UTF-8 bytes, byte mode, error correction level M as the MNB
 * standard requires) and returns it as one SVG path, rendered server-side with no script.
 */
export function qrSvg(payload: string): QrSvg {
  const bytes = Array.from(new TextEncoder().encode(payload));
  const { size, data } = encode(bytes, { ecc: MNB_QR_ERROR_CORRECTION, border: QUIET_ZONE });
  const parts: string[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && row[x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h-${x - start}z`);
    }
  });
  return { size, path: parts.join("") };
}

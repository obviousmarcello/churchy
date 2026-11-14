const SEPARATORS = /[\s-]/g;

function groups8(digits: string): string {
  return digits.match(/\d{8}/g)!.join("-");
}

/**
 * Normalises a Hungarian bank account number to `12345678-12345678-12345678`
 * (24 digits) or `12345678-12345678` (16 digits). Spaces and hyphens in the input are ignored.
 * Returns `null` if the input is not exactly 16 or 24 digits.
 *
 * @example normalizeBankAccount("11773016 11111018 00000000") // "11773016-11111018-00000000"
 */
export function normalizeBankAccount(input: string): string | null {
  const digits = input.replace(SEPARATORS, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length !== 16 && digits.length !== 24) return null;
  return groups8(digits);
}

/**
 * Like {@link normalizeBankAccount}, but also accepts a Hungarian IBAN (`HU42 1177 …`),
 * converting it to the 8-8-8 form. Invalid input is returned trimmed instead of `null`.
 */
export function formatBankAccount(input: string): string {
  return normalizeBankAccount(input) ?? ibanToBankAccount(input) ?? input.trim();
}

/** `true` if the input is a 16- or 24-digit Hungarian account number. */
export function isValidBankAccount(input: string): boolean {
  return normalizeBankAccount(input) !== null;
}

function mod97(text: string): number {
  let rem = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // digits stay as-is, letters A–Z become 10–35
    const chunk = code >= 65 ? String(code - 55) : ch;
    for (const d of chunk) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem;
}

function compactIban(input: string): string {
  return input.replace(/\s/g, "").toUpperCase();
}

/** `true` if the input is a structurally valid IBAN (length, characters, mod-97 checksum). */
export function isValidIban(input: string): boolean {
  const iban = compactIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("HU") && iban.length !== 28) return false;
  return mod97(iban.slice(4) + iban.slice(0, 4)) === 1;
}

/**
 * Groups a valid IBAN in blocks of four (`HU42 1177 3016 1111 1018 0000 0000`),
 * or returns `null` if it is invalid.
 */
export function formatIban(input: string): string | null {
  if (!isValidIban(input)) return null;
  return compactIban(input)
    .match(/.{1,4}/g)!
    .join(" ");
}

/**
 * Converts a Hungarian IBAN to the domestic 8-8-8 account number, or `null` if the input
 * is not a valid `HU` IBAN.
 */
export function ibanToBankAccount(input: string): string | null {
  const iban = compactIban(input);
  if (!iban.startsWith("HU") || !isValidIban(iban)) return null;
  return groups8(iban.slice(4));
}

/**
 * Builds the IBAN (grouped by four) for a domestic account number.
 * 16-digit accounts are padded with eight zeros. Returns `null` for an invalid account number.
 *
 * @example bankAccountToIban("11773016-11111018-00000000") // "HU42 1177 3016 1111 1018 0000 0000"
 */
export function bankAccountToIban(input: string): string | null {
  const account = normalizeBankAccount(input);
  if (!account) return null;
  const bban = account.replace(/-/g, "").padEnd(24, "0");
  const check = String(98 - mod97(`${bban}HU00`)).padStart(2, "0");
  return formatIban(`HU${check}${bban}`);
}

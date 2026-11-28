/** A postal address in Hungary (or abroad, with the same order). */
export interface Address {
  /** Postal code (*1011*). */
  postalCode?: string;
  /** Settlement (*Budapest*). */
  city: string;
  /** Public place name including its type (*Fő utca*). */
  street?: string;
  /** House number (*1*, *12/A*, *3-5*). A trailing period is added. */
  houseNumber?: string;
  /** Building / floor / door details (*2. em. 5.*), appended after the house number. */
  details?: string;
}

const clean = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/**
 * Hungarian address order: postal code, city, street, house number.
 *
 * @example formatAddress({ postalCode: "1011", city: "Budapest", street: "Fő utca", houseNumber: "1" })
 * // "1011 Budapest, Fő utca 1."
 */
export function formatAddress(address: Address): string {
  const city = [clean(address.postalCode), clean(address.city)].filter(Boolean).join(" ");
  let number = clean(address.houseNumber);
  if (/^\d/.test(number) && !number.endsWith(".")) number += ".";
  const street = [clean(address.street), number, clean(address.details)].filter(Boolean).join(" ");
  return [city, street].filter(Boolean).join(", ");
}

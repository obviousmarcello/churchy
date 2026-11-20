const NBSP = String.fromCharCode(0xa0);
const MINUS = String.fromCharCode(0x2212);

/**
 * Hungarian forint amount: groups of three digits separated by a no-break space, then `Ft`
 * (`4 990 Ft`, `1 249 000 Ft`). Whole forints only; fractions are rounded, as HUF has no
 * subunit in use.
 *
 * @example formatHuf(4990) // "4 990 Ft"
 * @example formatHuf(0) // "0 Ft"
 */
export function formatHuf(amount: number): string {
  if (!Number.isFinite(amount)) throw new RangeError(`Invalid amount: ${amount}`);
  const rounded = Math.round(Math.abs(amount));
  const digits = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = amount < 0 && rounded !== 0 ? MINUS : "";
  return `${sign}${digits}${NBSP}Ft`;
}

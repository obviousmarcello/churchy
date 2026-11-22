import { cn } from "../cn";

/**
 * The church's initials in a tinted badge: the brand mark when no logo is uploaded. Decorative
 * (`aria-hidden`); the name next to it is the label. The shape follows the theme's radius.
 */
export function Monogram({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-monogram=""
      className={cn(
        "inline-grid size-10 shrink-0 place-items-center rounded-tile bg-primary font-heading shadow-[0_6px_14px_-8px_var(--c-primary)] text-fs-3 leading-none [font-weight:var(--fw-heading-sm,var(--fw-heading))] tracking-wide text-primary-contrast lg:size-11 lg:text-fs-4",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/**
 * Up to two initials of a church name for its {@link Monogram}: the first letters of the first
 * two capitalised words ("Szent Tivadar" → "ST", "Dunaligeti Református Egyházközség" → "DR").
 */
export function monogramOf(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => /^\p{Lu}/u.test(w));
  const picked = (words.length > 0 ? words : name.split(/\s+/)).slice(0, 2);
  return picked
    .map((w) => w.charAt(0))
    .join("")
    .toLocaleUpperCase("hu");
}

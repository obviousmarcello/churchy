import { cn } from "./cn";

/**
 * Klasszikus flourish: hairline, diamond, hairline in the accent colour. Purely decorative and
 * hidden in the admin variant, which stays plain.
 */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      width="120"
      height="12"
      aria-hidden="true"
      focusable="false"
      className={cn("text-accent in-data-[ui=admin]:hidden", className)}
    >
      <path d="M0 6h50M70 6h50" stroke="currentColor" strokeWidth="1" />
      <path d="M60 1l5 5-5 5-5-5z" fill="currentColor" />
    </svg>
  );
}

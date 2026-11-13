import type { ReactNode } from "react";
import { cn } from "../cn";
import { Ornament } from "../ornament";

export interface SectionHeadingProps {
  /** id of the heading element (for `aria-labelledby`). */
  id?: string;
  title: string;
  /** Heading level, default `h2`. */
  level?: 2 | 3;
  /** Small caps line above the title. */
  eyebrow?: string;
  /** Right-aligned action, typically a "see all" link. */
  action?: ReactNode;
  align?: "start" | "center";
  className?: string;
}

/** Section title with the Klasszikus ornament (hidden in the admin variant). */
export function SectionHeading({
  id,
  title,
  level = 2,
  eyebrow,
  action,
  align = "start",
  className,
}: SectionHeadingProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-2",
        centered && "flex-col items-center text-center",
        className,
      )}
    >
      <div className={cn(centered && "flex flex-col items-center")}>
        {eyebrow ? (
          <p className="mb-1 text-fs-1 font-bold tracking-[0.16em] text-accent-text uppercase">
            {eyebrow}
          </p>
        ) : null}
        <Heading
          id={id}
          className={cn(
            "font-heading leading-[1.08] font-bold text-primary",
            level === 2 ? "text-fs-6" : "text-fs-5",
          )}
        >
          {title}
        </Heading>
        <Ornament className="mt-3" />
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

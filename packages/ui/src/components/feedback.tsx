import type { ReactNode } from "react";
import { cn } from "../cn";
import { CheckIcon, DangerIcon } from "../icons";

export interface EmptyStateProps {
  /** Decorative icon, e.g. `<InboxIcon />`. */
  icon?: ReactNode;
  /** What is empty, said plainly ("Még nincs kérelem"). */
  title: string;
  /** What to do about it. */
  description?: ReactNode;
  /** Usually one `Button` / `ButtonLink` that fixes the emptiness. */
  action?: ReactNode;
  /** Render the title as a heading of this level; default a paragraph (no outline entry). */
  headingLevel?: 2 | 3 | 4;
  /** `sm` for inside a table or card, `md` for a whole page section. */
  size?: "sm" | "md";
  className?: string;
  "data-testid"?: string;
}

/** Nothing here yet: says what is missing and offers the next step. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel,
  size = "md",
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  const Title = headingLevel ? (`h${headingLevel}` as "h2" | "h3" | "h4") : "p";
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center text-center",
        size === "md"
          ? "gap-3 rounded-lg border border-dashed border-border px-6 py-12"
          : "gap-2 px-4 py-8",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-grid place-items-center rounded-full bg-surface-sunken text-muted",
            size === "md" ? "size-12 [&_svg]:size-6" : "size-10 [&_svg]:size-5",
          )}
        >
          {icon}
        </span>
      ) : null}
      <Title className="font-body text-fs-4 leading-snug font-semibold text-text">{title}</Title>
      {description ? <div className="max-w-[48ch] text-fs-3 text-muted">{description}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export interface SkeletonProps {
  /** `text` lines, a `rect` block (image, card) or a `circle` (avatar). */
  shape?: "text" | "rect" | "circle";
  /** Number of text lines (the last one is shorter). */
  lines?: number;
  /** Size / layout (e.g. `h-40 w-full`, `size-10`). */
  className?: string;
}

/**
 * Placeholder while content loads. Decorative (`aria-hidden`): wrap the loading region in
 * `<LoadingRegion label>` so assistive technology hears one status message instead.
 */
export function Skeleton({ shape = "text", lines = 1, className }: SkeletonProps) {
  const block = "animate-pulse bg-surface-sunken motion-reduce:animate-none";
  if (shape === "text") {
    return (
      <span aria-hidden="true" className={cn("grid gap-2", className)}>
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={cn(
              block,
              "block h-[0.9em] rounded-sm",
              lines > 1 && i === lines - 1 ? "w-3/5" : "w-full",
            )}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        block,
        "block",
        shape === "circle" ? "size-10 rounded-full" : "h-24 w-full rounded-md",
        className,
      )}
    />
  );
}

export interface LoadingRegionProps {
  /** Announced once, e.g. "Betöltés…". Visually hidden. */
  label: string;
  children: ReactNode;
  className?: string;
}

/** Wraps skeletons: `aria-busy` plus one visually hidden status text. */
export function LoadingRegion({ label, children, className }: LoadingRegionProps) {
  return (
    <div aria-busy="true" className={className}>
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SaveStatusProps {
  state: SaveState;
  /** Texts per state from messages/hu.json; `saved` should name the action ("Mentve"). */
  messages: { saving: string; saved: string; error: string };
  className?: string;
  "data-testid"?: string;
}

/**
 * Inline confirmation next to a form's submit button ("Mentve"). Always rendered, so the live region
 * exists before the message appears and screen readers announce it.
 */
export function SaveStatus({ state, messages, className, "data-testid": testId }: SaveStatusProps) {
  return (
    <p
      role="status"
      data-testid={testId}
      data-state={state}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 text-fs-2 font-semibold [&_svg]:size-4",
        state === "error" ? "text-danger" : state === "saved" ? "text-success" : "text-muted",
        className,
      )}
    >
      {state === "saving" ? <span>{messages.saving}</span> : null}
      {state === "saved" ? (
        <span
          key="saved"
          className="inline-flex items-center gap-1.5 motion-safe:animate-[ui-fade-in_200ms_ease-out]"
        >
          <CheckIcon />
          {messages.saved}
        </span>
      ) : null}
      {state === "error" ? (
        <span className="inline-flex items-center gap-1.5">
          <DangerIcon />
          {messages.error}
        </span>
      ) : null}
    </p>
  );
}

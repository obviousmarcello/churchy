import { Skeleton } from "@/components/music/ui/skeleton";
import { cn } from "@/lib/music/utils";

// The loading states of the pages: grey shapes in the layout of the content
// that comes, so the page does not jump when it arrives. Screen readers hear
// the text of `label`. No hooks: the server pages use them as Suspense
// fallbacks too.

// The widths of the text lines, so the rows do not all look the same.
const WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5", "w-1/3"];

function width(index: number): string {
  return WIDTHS[index % WIDTHS.length]!;
}

/** The content that loads, with its text for screen readers. */
export function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A list with a title and a detail line in each row, e.g. the songs. */
export function RowsSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <LoadingRegion label={label}>
      <ul className="divide-y">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="flex flex-col gap-2 px-4 py-3.5 sm:px-6">
            <Skeleton className={cn("h-4", width(index))} />
            <Skeleton className={cn("h-3", width(index + 3), "max-w-48")} />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}

/** Event cards with a date badge, e.g. the events list or the dashboard. */
export function EventCardsSkeleton({
  label,
  count = 4,
  featured,
}: {
  label: string;
  count?: number;
  /** The first card is larger, as on the dashboard. */
  featured?: boolean;
}) {
  return (
    <LoadingRegion label={label} className="flex w-full max-w-3xl flex-col gap-2 px-4 py-6 sm:px-6">
      {Array.from({ length: count }, (_, index) => {
        const large = featured && index === 0;
        return (
          <div
            key={index}
            className={cn(
              "flex items-center gap-4 rounded-card border bg-surface-raised p-4 shadow-xs",
              large && "mb-6 p-5 sm:p-6",
            )}
          >
            <Skeleton className={cn("size-14 shrink-0 rounded-card", large && "size-16")} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className={cn("h-4", width(index), large && "h-5")} />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        );
      })}
    </LoadingRegion>
  );
}

/** The page of one event: the volunteers, the details and the setlist. */
/** The rows of the events list next to an open event. */
export function EventRowsSkeleton({ label, count = 5 }: { label: string; count?: number }) {
  return (
    <LoadingRegion label={label} className="flex flex-col gap-1 px-4 pt-4 sm:px-6 lg:px-1 lg:pt-0">
      <Skeleton className="mb-3 h-9 w-full rounded-card" />
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-2">
          <Skeleton className="size-11 shrink-0 rounded-control" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", width(index))} />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  );
}

export function EventDetailSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={label} className="flex w-full flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-start gap-4">
        <Skeleton className="size-16 rounded-card" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t pt-6">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-card" />
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Form fields: a label and a field each, e.g. a settings section. */
export function FormSkeleton({
  label,
  fields = 2,
  className,
}: {
  label: string;
  fields?: number;
  className?: string;
}) {
  return (
    <LoadingRegion label={label} className={cn("flex flex-col gap-4", className)}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-9 w-full max-w-md" />
        </div>
      ))}
    </LoadingRegion>
  );
}

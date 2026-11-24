import { cn } from "@/lib/music/utils";

/** A grey shape in place of content that loads. Screen readers skip it: see `LoadingRegion`. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

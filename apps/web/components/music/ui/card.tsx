import { cn } from "@churchy/ui";

// For elements other than a div, for example an `<article>`.
const cardClassName =
  "flex flex-col gap-6 rounded-card border bg-surface-raised p-4 text-text shadow-xs sm:p-6";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn(cardClassName, className)} {...props} />;
}

export { Card, cardClassName };

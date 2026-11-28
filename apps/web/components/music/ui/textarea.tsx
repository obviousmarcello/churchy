import { cn } from "@churchy/ui";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-card border border-border-strong bg-surface-raised px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted/70 placeholder:italic focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50 disabled:cursor-not-allowed disabled:bg-border-strong/50 disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 md:text-sm dark:disabled:bg-border-strong/80 dark:aria-invalid:border-danger/50 dark:aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

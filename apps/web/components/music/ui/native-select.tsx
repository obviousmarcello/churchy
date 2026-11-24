import { cn } from "@churchy/ui";

// A native <select> with the look of `Input`. Native selects work well on
// phones and with assistive technology.
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-border-strong bg-border-strong-background px-2 py-1 text-base transition-colors outline-none focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-border-strong/50 disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20 md:text-sm dark:disabled:bg-border-strong/80 dark:aria-invalid:border-danger/50 dark:aria-invalid:ring-danger/40 [&>option]:bg-surface-raised [&>option]:text-text",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };

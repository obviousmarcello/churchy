"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { CloseIcon } from "../icons";
import { usePortalContainer } from "./scope";

export interface DialogProps {
  /** The element that opens the dialog (rendered as-is, usually a `<Button>`). */
  trigger?: ReactNode;
  title: string;
  description?: string;
  /** Accessible name of the close (X) button. */
  closeLabel: string;
  children?: ReactNode;
  /** Wide variant for dialogs that hold a grid (media picker). */
  wide?: boolean;
  /**
   * `center` (default): a modal card in the middle of the screen.
   * `end`: a drawer that slides in from the right edge (a bottom sheet on phones), for filters,
   * details of a list item or longer side forms.
   */
  placement?: "center" | "end";
  /** Action row; wrap dismissing buttons in `<DialogClose asChild>`. */
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Closes the surrounding dialog; use with `asChild`. */
export const DialogClose = RadixDialog.Close;

const placementClasses = {
  // Pop in with a spring, leave faster than it came (Radix waits for the exit animation).
  center: (wide?: boolean) =>
    cn(
      "top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-overlay p-6 sm:p-8",
      wide ? "w-[min(60rem,calc(100vw-2rem))]" : "w-[min(34rem,calc(100vw-2rem))]",
      "data-[state=open]:animate-[ui-dialog-in_var(--dur-3)_var(--ease-spring)]",
      "data-[state=closed]:animate-[ui-pop-out_var(--dur-2)_var(--ease-exit)_forwards]",
    ),
  end: () =>
    cn(
      "inset-x-2 bottom-2 max-h-[85dvh] rounded-overlay p-6",
      "sm:inset-x-auto sm:top-2 sm:right-2 sm:bottom-2 sm:max-h-none sm:w-[min(30rem,calc(100vw-1rem))] sm:p-8",
      "data-[state=open]:animate-[ui-slide-in-bottom_var(--dur-3)_var(--ease-emphasized)]",
      "data-[state=closed]:animate-[ui-slide-out-bottom_var(--dur-2)_var(--ease-exit)_forwards]",
      "sm:data-[state=open]:animate-[ui-slide-in-end_var(--dur-3)_var(--ease-emphasized)]",
      "sm:data-[state=closed]:animate-[ui-slide-out-end_var(--dur-2)_var(--ease-exit)_forwards]",
    ),
} as const;

/**
 * Modal dialog on Radix: focus is trapped and restored to the trigger, Escape closes, the page
 * behind is inert. Inside an `AdminScope` it portals into the scope so it keeps the admin variant.
 * Design v2: 24–32 px corners (`--radius-overlay`), a soft scrim that fades, and animated open /
 * close (instant under reduced motion).
 */
export function Dialog({
  trigger,
  title,
  description,
  closeLabel,
  children,
  wide,
  placement = "center",
  footer,
  open,
  defaultOpen,
  onOpenChange,
}: DialogProps) {
  const container = usePortalContainer();
  return (
    <RadixDialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--c-text)_42%,transparent)]",
            "data-[state=open]:animate-[ui-fade-in_var(--dur-3)_var(--ease-standard)]",
            "data-[state=closed]:animate-[ui-fade-out_var(--dur-2)_var(--ease-exit)_forwards]",
          )}
        />
        <RadixDialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          data-placement={placement}
          className={cn(
            "fixed z-50 flex flex-col overflow-y-auto border border-hairline bg-surface-raised text-text shadow-overlay",
            placementClasses[placement](wide),
          )}
        >
          <RadixDialog.Title className="pr-12 font-heading text-section-title [font-weight:var(--fw-heading-sm,var(--fw-heading))] text-text">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-fs-3 text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children ? <div className="mt-5">{children}</div> : null}
          {footer ? (
            <div
              className={cn(
                "mt-7 flex flex-wrap justify-end gap-3",
                placement === "end" && "sm:mt-auto sm:pt-7",
              )}
            >
              {footer}
            </div>
          ) : null}
          <RadixDialog.Close
            aria-label={closeLabel}
            className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full text-muted transition-[background-color,color,scale] duration-(--dur-2) ease-spring hover:bg-hover hover:text-text active:scale-(--motion-press)"
          >
            <CloseIcon className="size-5" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

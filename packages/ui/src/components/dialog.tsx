"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
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
  /** Action row; wrap dismissing buttons in `<DialogClose asChild>`. */
  footer?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Closes the surrounding dialog; use with `asChild`. */
export const DialogClose = RadixDialog.Close;

/**
 * Modal dialog on Radix: focus is trapped and restored to the trigger, Escape closes, the page
 * behind is inert. Inside an `AdminScope` it portals into the scope so it keeps the admin variant.
 */
export function Dialog({
  trigger,
  title,
  description,
  closeLabel,
  children,
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
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-text/60" />
        <RadixDialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface-raised p-6 text-text shadow-raised sm:p-8"
        >
          <RadixDialog.Title className="pr-12 font-heading text-fs-5 leading-tight font-bold text-primary">
            {title}
          </RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2 text-fs-3 text-muted">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
          <RadixDialog.Close
            aria-label={closeLabel}
            className="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-md text-text hover:bg-primary-soft"
          >
            <CloseIcon className="size-6" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

"use client";

import { useActionState, useState } from "react";

import { ConfirmDialog, ConfirmDialogTrigger } from "@/components/music/form-parts";
import { Button } from "@/components/music/ui/button";

type ConfirmState = { status: "idle" | "success" | "error"; message: string | null };

const IDLE: ConfirmState = { status: "idle", message: null };

/**
 * A button with a confirmation dialog for a destructive action, e.g. a
 * removal. `onConfirm` runs the action: an error shows in the dialog, a
 * success closes it. `failure`: the message when the request fails.
 */
export function ConfirmActionButton({
  id,
  label,
  icon,
  title,
  description,
  confirmLabel,
  pendingLabel,
  failure,
  onConfirm,
  disabled,
  iconOnly = false,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  failure: string;
  onConfirm: () => Promise<{ status: "success" } | { status: "error"; message: string }>;
  disabled?: boolean;
  /** A small button with the icon only; the label is its name. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (): Promise<ConfirmState> => {
    try {
      const result = await onConfirm();
      if (result.status === "error") return { status: "error", message: result.message || failure };
    } catch {
      return { status: "error", message: failure };
    }
    setOpen(false);
    return { status: "success", message: null };
  }, IDLE);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ConfirmDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={iconOnly ? "icon-sm" : "sm"}
              disabled={disabled}
              aria-label={iconOnly ? label : undefined}
              title={iconOnly ? label : undefined}
            />
          }
        >
          {icon}
          {!iconOnly && label}
        </ConfirmDialogTrigger>
      }
      title={title}
      description={description}
      id={id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
    />
  );
}

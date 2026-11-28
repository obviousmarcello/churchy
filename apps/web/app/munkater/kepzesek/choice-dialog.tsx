"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";

export type Choice = {
  label: string;
  variant?: "default" | "outline" | "destructive";
  onChoose: () => void;
};

/**
 * A question before an action, with its own buttons and "Cancel", e.g.
 * "Publish for all users" and "Remove the course". The caller closes it.
 */
export function ChoiceDialog({
  open,
  onOpenChange,
  title,
  description,
  choices,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  choices: Choice[];
  pending: boolean;
}) {
  const { m } = useI18n();

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <AlertDialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
          <DialogHeader>
            <AlertDialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">
              {description}
            </AlertDialog.Description>
          </DialogHeader>
          <DialogFooter>
            <DialogActions>
              <AlertDialog.Close
                render={<Button type="button" variant="ghost" disabled={pending} />}
              >
                {m.common.actions.cancel}
              </AlertDialog.Close>
              {choices.map((choice) => (
                <Button
                  key={choice.label}
                  type="button"
                  variant={choice.variant ?? "default"}
                  disabled={pending}
                  onClick={choice.onChoose}
                >
                  {choice.label}
                </Button>
              ))}
            </DialogActions>
          </DialogFooter>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

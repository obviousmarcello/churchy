"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Dialog, DialogClose } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { ItemOutcome } from "@/server/content-save";
import type { PolicyResult } from "@/server/policy";

export interface DeleteButtonProps {
  /** Name of the item, used in the accessible names and the question. */
  name: string;
  /** Policy-wrapped delete action bound to the item. */
  onDelete: () => Promise<PolicyResult<ItemOutcome>>;
  /** Where to go after deleting (the edit screens); omit on a list to just refresh it. */
  redirectTo?: string;
  size?: "sm" | "md";
}

/** Deleting always asks first (D-21): a dialog names the item and says it cannot be undone. */
export function DeleteButton({ name, onDelete, redirectTo, size = "sm" }: DeleteButtonProps) {
  const t = useT("admin.content.delete");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    const result = await onDelete();
    setBusy(false);
    if (result.ok && result.value === "ok") {
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } else {
      setFailed(true);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("question", { name })}
      closeLabel={t("close")}
      trigger={
        <Button
          variant="ghost"
          size={size}
          aria-label={t("trigger", { name })}
          data-testid="delete-open"
        >
          {t("button")}
        </Button>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">{t("cancel")}</Button>
          </DialogClose>
          <Button variant="danger" onClick={confirm} disabled={busy} data-testid="delete-confirm">
            {t("confirm")}
          </Button>
        </>
      }
    >
      <p>{t("warning")}</p>
      {failed ? (
        <div className="mt-4">
          <Alert tone="danger" title={t("failed")} />
        </div>
      ) : null}
    </Dialog>
  );
}

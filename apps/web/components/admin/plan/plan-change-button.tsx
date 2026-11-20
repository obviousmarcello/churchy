"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Dialog, DialogClose } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";
import type { PlanChangeOutcome } from "@/server/plan-admin";

export interface PlanChangeButtonProps {
  /** Display name of the plan (platform data). */
  planName: string;
  upgrade: boolean;
  /** Policy-wrapped action bound to the plan. */
  onChange: () => Promise<PolicyResult<PlanChangeOutcome>>;
}

/** Changing the plan asks first; a downgrade says that nothing is deleted (D-87 AC3). */
export function PlanChangeButton({ planName, upgrade, onChange }: PlanChangeButtonProps) {
  const t = useT("admin.plan.change");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const kind = upgrade ? "upgrade" : "downgrade";

  async function confirm() {
    setBusy(true);
    setFailed(false);
    const result = await onChange();
    setBusy(false);
    if (result.ok && result.value === "ok") {
      setOpen(false);
      router.refresh();
    } else {
      setFailed(true);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t(`${kind}.title`, { plan: planName })}
      description={t(`${kind}.question`, { plan: planName })}
      closeLabel={t("close")}
      trigger={
        <Button
          variant={upgrade ? "primary" : "secondary"}
          size="sm"
          aria-label={t(`${kind}.trigger`, { plan: planName })}
          data-testid={`plan-${kind}`}
        >
          {t(`${kind}.button`)}
        </Button>
      }
      footer={
        <>
          <DialogClose asChild>
            <Button variant="secondary">{t("cancel")}</Button>
          </DialogClose>
          <Button onClick={confirm} disabled={busy} data-testid="plan-change-confirm">
            {t("confirm")}
          </Button>
        </>
      }
    >
      <p>{t(`${kind}.body`)}</p>
      <p className="mt-2 text-muted">{t("demoNote")}</p>
      {failed ? (
        <div className="mt-4">
          <Alert tone="danger" title={t("failed")} />
        </div>
      ) : null}
    </Dialog>
  );
}

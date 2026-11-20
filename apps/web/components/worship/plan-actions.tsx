"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

type Outcome = PolicyResult<"ok" | "invalid" | "notFound">;

export interface PlanActionProps {
  /** Which status buttons the actor may use (from `can()`, decided on the server). */
  submit: (() => Promise<Outcome>) | null;
  approve: (() => Promise<Outcome>) | null;
  sendBack: (() => Promise<Outcome>) | null;
  /** The status changes that exist from the current status. */
  available: { submit: boolean; approve: boolean; sendBack: boolean };
}

/** Status flow buttons of a plan: *Véleményezésre küldés*, *Jóváhagyás*, *Visszaküldés* (D-68). */
export function PlanActions({ submit, approve, sendBack, available }: PlanActionProps) {
  const t = useT("munkater.worship.actions");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const run = (action: (() => Promise<Outcome>) | null) => {
    if (action === null) return;
    setFailed(false);
    start(async () => {
      const result = await action();
      if (result.ok && result.value === "ok") router.refresh();
      else setFailed(true);
    });
  };

  return (
    <div className="flex flex-col gap-2" data-testid="plan-actions">
      <div className="flex flex-wrap gap-2">
        {submit && available.submit ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(submit)}
            data-testid="plan-submit"
          >
            {t("submit")}
          </Button>
        ) : null}
        {approve && available.approve ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(approve)}
            data-testid="plan-approve"
          >
            {t("approve")}
          </Button>
        ) : null}
        {sendBack && available.sendBack ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(sendBack)}
            data-testid="plan-return"
          >
            {t("sendBack")}
          </Button>
        ) : null}
      </div>
      {failed ? (
        <Alert tone="danger" title={t("failedTitle")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Alert, Button, Dialog, DialogClose } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";
import type { ActiveOutcome } from "@/server/user-admin";

export interface MemberActiveButtonProps {
  /** Name of the person, used in the accessible names and the question. */
  name: string;
  /** The state the button switches the member to. */
  activate: boolean;
  /** Policy-wrapped action bound to the member. */
  onChange: () => Promise<PolicyResult<ActiveOutcome>>;
  /** Disabled with an explanation: the last active owner cannot be deactivated. */
  lockedReason?: string;
}

/** Deactivating (and reactivating) a user always asks first and explains refusals (D-26). */
export function MemberActiveButton({
  name,
  activate,
  onChange,
  lockedReason,
}: MemberActiveButtonProps) {
  const t = useT("admin.users.active");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"lastOwner" | "limit" | "failed" | null>(null);
  const kind = activate ? "activate" : "deactivate";
  const lockedId = useId();

  async function confirm() {
    setBusy(true);
    setProblem(null);
    const result = await onChange();
    setBusy(false);
    if (result.ok && result.value === "ok") {
      setOpen(false);
      router.refresh();
    } else if (result.ok && (result.value === "lastOwner" || result.value === "limit")) {
      setProblem(result.value);
    } else {
      setProblem("failed");
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t(`${kind}.title`)}
        description={t(`${kind}.question`, { name })}
        closeLabel={t("close")}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            aria-label={t(`${kind}.trigger`, { name })}
            disabled={lockedReason !== undefined}
            aria-describedby={lockedReason === undefined ? undefined : lockedId}
            data-testid={`member-${kind}`}
          >
            {t(`${kind}.button`)}
          </Button>
        }
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant={activate ? "primary" : "danger"}
              onClick={confirm}
              disabled={busy}
              data-testid="member-active-confirm"
            >
              {t(`${kind}.confirm`)}
            </Button>
          </>
        }
      >
        <p>{t(`${kind}.body`)}</p>
        {problem !== null ? (
          <div className="mt-4">
            <Alert tone="danger" title={t(`problems.${problem}`)} />
          </div>
        ) : null}
      </Dialog>
      {lockedReason !== undefined ? (
        <span id={lockedId} className="sr-only">
          {lockedReason}
        </span>
      ) : null}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

/** Approve / reject a pending request (D-60 approval flow). */
export function DecideButtons({
  id,
  name,
  decide,
}: {
  id: string;
  name: string;
  decide: (
    id: string,
    decision: "approved" | "rejected",
  ) => Promise<PolicyResult<"ok" | "invalid">>;
}) {
  const t = useT("munkater.rooms.approvals");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go(decision: "approved" | "rejected") {
    setBusy(true);
    await decide(id, decision);
    setBusy(false);
    router.refresh();
  }
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={() => go("approved")}
        aria-label={t("approveFor", { name })}
        data-testid="approve"
      >
        {t("approve")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => go("rejected")}
        aria-label={t("rejectFor", { name })}
        data-testid="reject"
      >
        {t("reject")}
      </Button>
    </span>
  );
}

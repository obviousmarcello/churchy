"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

/** Asks the candidate to cover the assignment; afterwards back to the absence overview. */
export function SubstituteButton({ run }: { run: () => Promise<PolicyResult<"ok" | "conflict">> }) {
  const t = useT("munkater.absence");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <Button
        type="button"
        disabled={pending}
        data-testid="ask-substitute"
        onClick={() =>
          start(async () => {
            const result = await run();
            if (result.ok && result.value === "ok") router.push("/munkater/tavollet?helyettes=1");
            else setFailed(true);
          })
        }
      >
        {t("askSubstitute")}
      </Button>
      {failed ? (
        <Alert tone="danger" role="alert" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </>
  );
}

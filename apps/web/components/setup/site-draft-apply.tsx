"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { applyDraftOwnerAction } from "@/server/site-builder-actions";

/** The owner's *Vázlat alkalmazása* button for one draft prepared by the operator. */
export function SiteDraftApply({ draftId }: { draftId: string }) {
  const t = useT("platform.siteBuilder.owner");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return (
    <div className="grid gap-3">
      <div>
        <Button
          type="button"
          disabled={pending || result?.tone === "success"}
          data-testid="owner-draft-apply"
          onClick={() =>
            start(async () => {
              const res = await applyDraftOwnerAction(draftId);
              if (!res.ok) setResult({ tone: "danger", text: t("forbidden") });
              else if (!res.value.ok) setResult({ tone: "danger", text: t("failed") });
              else setResult({ tone: "success", text: t("done", { ...res.value.summary }) });
            })
          }
        >
          {t("apply")}
        </Button>
      </div>
      {result ? (
        <Alert tone={result.tone} data-testid="owner-draft-result">
          <p>{result.text}</p>
        </Alert>
      ) : null}
    </div>
  );
}

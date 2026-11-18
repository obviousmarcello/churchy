"use client";

import { useState } from "react";
import { Button } from "@churchy/ui";
import { useT } from "@/i18n/client";

type CopyState = "idle" | "copied" | "failed";

/**
 * Copies `value` to the clipboard (support page, D-17). The value is shown next to the button, so
 * without JavaScript or clipboard access the visitor can still select it; the outcome is announced
 * in a polite live region.
 */
export function CopyButton({
  value,
  label,
  testId,
}: {
  value: string;
  /** Accessible, visible label, e.g. *Számlaszám másolása*. */
  label: string;
  testId?: string;
}) {
  const t = useT("public.giving");
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="secondary" size="sm" onClick={copy} data-testid={testId}>
        {label}
      </Button>
      <span
        role="status"
        className="text-fs-2 text-muted"
        data-testid={testId && `${testId}-status`}
      >
        {state === "copied" ? t("copied") : state === "failed" ? t("copyFailed") : null}
      </span>
    </span>
  );
}

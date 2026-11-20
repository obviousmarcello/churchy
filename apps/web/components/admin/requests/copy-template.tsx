"use client";

import { useState } from "react";
import { Button } from "@churchy/ui";
import { useT } from "@/i18n/client";

/** Copies the reply template to the clipboard; the text stays visible to select by hand. */
export function CopyTemplate({ value }: { value: string }) {
  const t = useT("admin.requests.detail");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" onClick={copy} data-testid="reply-copy">
        {t("replyCopy")}
      </Button>
      <span role="status" className="text-fs-2 font-semibold text-success">
        {copied ? t("replyCopied") : ""}
      </span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { facebookShareUrl, messengerShareUrl } from "@/lib/news/public-news";

type CopyState = "idle" | "copied" | "failed";

/**
 * Share links of a post (D-13 AC3): Facebook's sharer page and Messenger's share link are plain
 * links, copy-link uses `navigator.clipboard`. No SDK, widget or script of a third party is ever
 * loaded, and nothing is requested from Facebook until the visitor follows a link.
 */
export function ShareLinks({ url, headingId }: { url: string; headingId: string }) {
  const t = useT("public.news");
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid="share-links">
      <h2 id={headingId} className="font-heading text-fs-4 font-bold">
        {t("share")}
      </h2>
      <div className="flex flex-wrap gap-2">
        <ButtonLink
          href={facebookShareUrl(url)}
          variant="secondary"
          size="sm"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="share-facebook"
        >
          {t("shareFacebook")}
          <span className="sr-only"> {t("opensInNewTab")}</span>
        </ButtonLink>
        <ButtonLink
          href={messengerShareUrl(url)}
          variant="secondary"
          size="sm"
          data-testid="share-messenger"
        >
          {t("shareMessenger")}
        </ButtonLink>
        <Button variant="secondary" size="sm" onClick={copy} data-testid="share-copy">
          {t("copyLink")}
        </Button>
      </div>
      <p role="status" className="text-fs-3 text-muted break-all" data-testid="share-status">
        {state === "copied" ? t("copied") : state === "failed" ? t("copyFailed", { url }) : null}
      </p>
    </section>
  );
}

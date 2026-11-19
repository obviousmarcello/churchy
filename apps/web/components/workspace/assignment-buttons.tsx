"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

type Respond = (id: string, accept: boolean) => Promise<PolicyResult<"ok" | "invalid">>;

/** *Elfogadom* / *Nem tudok*: the one-tap answer to an assignment request (SDD §24). */
export function AssignmentButtons({ id, respond }: { id: string; respond: Respond }) {
  const t = useT("munkater.home.todos");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  function answer(accept: boolean) {
    setFailed(false);
    start(async () => {
      const result = await respond(id, accept);
      if (result.ok && result.value === "ok") router.refresh();
      else setFailed(true);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => answer(true)}
          data-testid="assignment-accept"
        >
          {t("accept")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => answer(false)}
          data-testid="assignment-decline"
        >
          {t("decline")}
        </Button>
      </div>
      {failed ? (
        <Alert tone="danger" title={t("failedTitle")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

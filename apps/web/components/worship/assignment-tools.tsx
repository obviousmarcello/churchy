"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Select } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

type Outcome = PolicyResult<"ok" | "invalid" | "notFound">;

/** *Cserét kérek* (own accepted assignment) or *Átvállalom* (open swap of the own team). */
export function SwapButton({
  mode,
  action,
}: {
  mode: "request" | "takeOver";
  action: () => Promise<Outcome>;
}) {
  const t = useT("munkater.worship.assignments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        data-testid={mode === "request" ? "swap-request" : "swap-take"}
        onClick={() =>
          start(async () => {
            const result = await action();
            if (result.ok && result.value === "ok") router.refresh();
            else setFailed(true);
          })
        }
      >
        {mode === "request" ? t("requestSwap") : t("takeOver")}
      </Button>
      {failed ? <span className="text-danger">{t("failed")}</span> : null}
    </span>
  );
}

export interface CandidateOption {
  personId: string;
  label: string;
}

/** The leader puts one of the ranked candidates on a position (D-67 AC1: reasons shown). */
export function AssignPicker({
  positionName,
  candidates,
  assign,
}: {
  positionName: string;
  candidates: readonly CandidateOption[];
  assign: (personId: string) => Promise<Outcome>;
}) {
  const t = useT("munkater.worship.assignments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [person, setPerson] = useState("");
  const [failed, setFailed] = useState(false);

  if (candidates.length === 0) return <p className="text-muted">{t("noCandidates")}</p>;
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="assign-picker">
      <div className="min-w-64 flex-1">
        <Select
          label={t("candidate", { position: positionName })}
          value={person}
          placeholder={t("choose")}
          onChange={(e) => setPerson(e.target.value)}
          options={candidates.map((c) => ({ value: c.personId, label: c.label }))}
        />
      </div>
      <Button
        type="button"
        size="sm"
        disabled={pending || person === ""}
        data-testid="assign-add"
        aria-label={t("assignFor", { position: positionName })}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const result = await assign(person);
            if (result.ok && result.value === "ok") {
              setPerson("");
              router.refresh();
            } else {
              setFailed(true);
            }
          })
        }
      >
        {t("assign")}
      </Button>
      {failed ? (
        <Alert tone="danger" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

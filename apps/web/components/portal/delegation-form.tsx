"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Button, Checkbox } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

export interface DelegationCategory {
  readonly key: string;
  readonly name: string;
  readonly confidential: boolean;
}

/**
 * The parish's choice of HR categories it delegates to the diocese (SDD §25.7). Used to approve a
 * link (`run` approves and saves) and to change the choice of an active link. Confidential
 * categories start unchecked and are marked: the diocese reaches them only through its
 * confidential handler.
 */
export function DelegationForm({
  categories,
  initial,
  run,
  submitLabel,
  testId,
}: {
  categories: readonly DelegationCategory[];
  initial: readonly string[];
  run: (keys: string[]) => Promise<PolicyResult<"ok" | "conflict">>;
  submitLabel: string;
  testId: string;
}) {
  const t = useT("admin.orgLink");
  const router = useRouter();
  const [keys, setKeys] = useState<readonly string[]>(initial);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const toggle = (key: string, on: boolean) =>
    setKeys((current) => (on ? [...current, key] : current.filter((k) => k !== key)));
  return (
    <form
      className="flex flex-col gap-3"
      data-testid={testId}
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setFailed(false);
          const result = await run([...keys]);
          if (result.ok && result.value === "ok") router.refresh();
          else setFailed(true);
        });
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-bold">{t("delegateLegend")}</legend>
        {categories.map((c) => (
          <Checkbox
            key={c.key}
            name="category"
            value={c.key}
            label={c.name}
            help={c.confidential ? t("confidentialHelp") : undefined}
            checked={keys.includes(c.key)}
            onChange={(event) => toggle(c.key, event.currentTarget.checked)}
          />
        ))}
      </fieldset>
      <Button
        type="submit"
        disabled={pending}
        className="self-start"
        data-testid={`${testId}-submit`}
      >
        {submitLabel}
      </Button>
      {failed ? (
        <Alert tone="danger" role="alert" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportStage } from "@churchy/contracts";
import { Alert, Button, Checkbox, Input, Select, Textarea } from "@churchy/ui";
import { ImportProgress } from "@/components/setup/import-progress";
import { useT } from "@/i18n/client";
import { INITIAL_PROGRESS, type ImportProgress as Progress } from "@/lib/setup/progress";

export interface TenantOption {
  readonly id: string;
  readonly name: string;
}

type StreamEvent =
  | { type: "stage"; stage: ImportStage; status: "started" | "completed"; count?: number }
  | { type: "draft"; id: string }
  | { type: "failed"; code: string };

const ERROR_KEYS = {
  no_consent: "noConsent",
  invalid_url: "invalidUrl",
  invalid_request: "invalidRequest",
  unavailable: "unavailable",
  busy: "busy",
  robots_blocked: "robotsBlocked",
  unreachable: "unreachable",
  cost_cap: "costCap",
  model_failed: "modelFailed",
  invalid_plan: "invalidPlan",
  aborted: "aborted",
  error: "error",
} as const;

function reduce(state: Progress, e: Extract<StreamEvent, { type: "stage" }>): Progress {
  if (e.status === "started") return { ...state, running: e.stage };
  return {
    completed: state.completed.includes(e.stage) ? state.completed : [...state.completed, e.stage],
    running: state.running === e.stage ? null : state.running,
    counts: e.count === undefined ? state.counts : { ...state.counts, [e.stage]: e.count },
  };
}

/** The operator's start form: address, consent, target; streams the build and opens the review. */
export function SiteBuilderForm({ tenants }: { tenants: readonly TenantOption[] }) {
  const t = useT("platform.siteBuilder");
  const router = useRouter();
  const abort = useRef<AbortController | null>(null);
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [target, setTarget] = useState<"new" | "existing">("new");
  const [tenantId, setTenantId] = useState("");
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<keyof typeof ERROR_KEYS | null>(null);

  const consentError = error === "no_consent" ? t("errors.noConsent") : undefined;

  async function start() {
    if (!consent) {
      setError("no_consent");
      return;
    }
    setError(null);
    setProgress(INITIAL_PROGRESS);
    setRunning(true);
    const controller = new AbortController();
    abort.current = controller;
    let code: keyof typeof ERROR_KEYS | null = "error";
    try {
      const res = await fetch("/platform/webhely-epito/epit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          consent: true,
          note: note.trim() || null,
          targetTenantId: target === "existing" && tenantId ? tenantId : null,
        }),
        signal: controller.signal,
      });
      if (res.body === null) throw new Error("no body");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        buffer += value ?? "";
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const l of lines) {
          if (!l.trim()) continue;
          const event = JSON.parse(l) as StreamEvent;
          if (event.type === "stage") setProgress((p) => reduce(p, event));
          else if (event.type === "draft") {
            code = null;
            router.push(`/platform/webhely-epito/${event.id}`);
          } else if (event.type === "failed") {
            code = (event.code in ERROR_KEYS ? event.code : "error") as keyof typeof ERROR_KEYS;
          }
        }
        if (done) break;
      }
    } catch {
      code = controller.signal.aborted ? "aborted" : "error";
    }
    setRunning(false);
    setError(code);
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid max-w-prose gap-5"
        noValidate
        data-testid="site-builder-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!running) void start();
        }}
      >
        <Input
          label={t("form.urlLabel")}
          help={t("form.urlHint")}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("form.urlPlaceholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          error={error === "invalid_url" ? t("errors.invalidUrl") : undefined}
        />
        <Checkbox
          label={t("form.consentLabel")}
          help={t("form.consentHint")}
          checked={consent}
          error={consentError}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked && error === "no_consent") setError(null);
          }}
        />
        <Textarea
          label={t("form.noteLabel")}
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <fieldset className="grid gap-2">
          <legend className="font-semibold">{t("form.targetLegend")}</legend>
          {(["new", "existing"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input
                type="radio"
                name="target"
                value={v}
                checked={target === v}
                onChange={() => setTarget(v)}
              />
              {v === "new" ? t("form.targetNew") : t("form.targetExisting")}
            </label>
          ))}
        </fieldset>
        {target === "existing" ? (
          <Select
            label={t("form.tenantLabel")}
            placeholder={t("form.tenantPlaceholder")}
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            options={tenants.map((x) => ({ value: x.id, label: x.name }))}
          />
        ) : null}
        <div className="flex gap-3">
          <Button type="submit" disabled={running} data-testid="site-builder-start">
            {running ? t("form.running") : t("form.submit")}
          </Button>
          {running ? (
            <Button type="button" variant="secondary" onClick={() => abort.current?.abort()}>
              {t("form.cancel")}
            </Button>
          ) : null}
        </div>
      </form>
      {error !== null && error !== "no_consent" && error !== "invalid_url" ? (
        <Alert tone="danger" data-testid="site-builder-error">
          <p>{t(`errors.${ERROR_KEYS[error]}`)}</p>
        </Alert>
      ) : null}
      {running || progress.completed.length > 0 ? <ImportProgress progress={progress} /> : null}
    </div>
  );
}

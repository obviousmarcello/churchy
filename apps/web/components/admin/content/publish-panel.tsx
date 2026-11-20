"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, ButtonLink, type BadgeTone } from "@churchy/ui";
import { FormField } from "@/components/admin/form-field";
import { useT } from "@/i18n/client";
import type { ItemOutcome } from "@/server/content-save";
import type { PolicyResult } from "@/server/policy";

type Outcome = Promise<PolicyResult<ItemOutcome>>;

export type PanelState = "draft" | "scheduled" | "published" | "expired" | "cancelled";

export interface PublishPanelProps {
  state: PanelState;
  /** Translated state label and, when relevant, the formatted date ("2026. november 20., 18:00"). */
  stateLabel: string;
  detail?: string;
  /** Scheduling (a future date-time) is offered for pages, news and announcements. */
  scheduling: boolean;
  /** The actor may publish (`can(…publish)`); otherwise the panel only shows the state. */
  canPublish: boolean;
  /** Preview in the admin (draft mode, not available to visitors). */
  previewHref: string;
  /** The live page, once published. */
  liveHref?: string;
  onPublish: (local: string | null) => Outcome;
  onUnpublish: () => Outcome;
  /** Events only: mark as cancelled. */
  onCancel?: () => Outcome;
  testId?: string;
}

const tone: Record<PanelState, BadgeTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  expired: "warning",
  cancelled: "danger",
};

/**
 * Publishing workflow (D-20): draft → published now or scheduled for a date-time, back to draft,
 * and the preview. The state itself is computed on the server from `status` and `publishedAt`.
 */
export function PublishPanel(props: PublishPanelProps) {
  const t = useT("admin.content.publish");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"done" | "failed" | "invalidDate" | null>(null);
  const [when, setWhen] = useState("");
  const { state, onCancel } = props;

  async function run(call: () => Outcome) {
    setBusy(true);
    setMessage(null);
    const result = await call();
    setBusy(false);
    if (result.ok && result.value === "ok") {
      setMessage("done");
      router.refresh();
    } else {
      setMessage(result.ok && result.value === "invalid" ? "invalidDate" : "failed");
    }
  }

  const isLive = state === "published" || state === "expired";
  return (
    <section
      aria-labelledby="publish-heading"
      className="flex max-w-2xl flex-col gap-4 rounded-md border-2 border-border-strong bg-surface-raised p-5"
      data-testid={props.testId ?? "publish-panel"}
      data-state={state}
    >
      <h2 id="publish-heading" className="font-heading text-fs-5 font-bold text-primary">
        {t("heading")}
      </h2>
      <p className="flex flex-wrap items-center gap-3">
        <Badge tone={tone[state]} data-testid="publish-state">
          {props.stateLabel}
        </Badge>
        {props.detail ? <span className="text-muted">{props.detail}</span> : null}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={props.previewHref} variant="secondary" data-testid="preview-link">
          {t("preview")}
        </ButtonLink>
        {props.liveHref && isLive ? (
          <ButtonLink href={props.liveHref} variant="ghost" data-testid="live-link">
            {t("viewLive")}
          </ButtonLink>
        ) : null}
      </div>

      {props.canPublish ? (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex flex-wrap gap-3">
            {state !== "published" && state !== "expired" ? (
              <Button
                disabled={busy}
                onClick={() => run(() => props.onPublish(null))}
                data-testid="publish-now"
              >
                {state === "cancelled" ? t("republish") : t("publishNow")}
              </Button>
            ) : null}
            {onCancel && state === "published" ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(onCancel)}
                data-testid="publish-cancel"
              >
                {t("cancelEvent")}
              </Button>
            ) : null}
            {state !== "draft" ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(props.onUnpublish)}
                data-testid="publish-undo"
              >
                {t("backToDraft")}
              </Button>
            ) : null}
          </div>

          {props.scheduling && (state === "draft" || state === "scheduled") ? (
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t("scheduleAt")} help={t("scheduleHelp")}>
                {(control) => (
                  <input
                    {...control}
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    data-testid="schedule-at"
                    className="block min-h-(--control-h-md) rounded-md border-2 border-border-strong bg-surface-raised px-4 py-2 text-fs-3 text-text"
                  />
                )}
              </FormField>
              <Button
                variant="secondary"
                disabled={busy || when === ""}
                onClick={() => run(() => props.onPublish(when))}
                data-testid="schedule-submit"
              >
                {t("schedule")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted">{t("noRight")}</p>
      )}

      <div role="status" aria-live="polite">
        {message === "done" ? <p className="font-semibold text-success">{t("done")}</p> : null}
        {message === "failed" ? <Alert tone="danger" title={t("failed")} /> : null}
        {message === "invalidDate" ? <Alert tone="danger" title={t("invalidDate")} /> : null}
      </div>
    </section>
  );
}

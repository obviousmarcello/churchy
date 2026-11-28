"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { RequestStatus } from "@churchy/contracts";
import { Alert, Button, Select, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { RequestOutcome } from "@/server/request-actions";
import type { PolicyResult } from "@/server/policy";

type Outcome = Promise<PolicyResult<RequestOutcome>>;

export interface RequestWorkflowProps {
  /** Status changes offered from the current status, with their (translated) labels. */
  transitions: readonly { status: RequestStatus; label: string }[];
  assigneeUserId: string | null;
  handlers: readonly { id: string; name: string }[];
  /** Policy-wrapped actions, bound to the request. */
  setStatus: (status: RequestStatus) => Outcome;
  assign: (userId: string | null) => Outcome;
  addNote: (body: string) => Outcome;
}

/**
 * Handling a request (D-29): status buttons, assignee and internal notes. Every action is a
 * policy-wrapped server action; the screen refreshes after each one. Notes are written here and
 * shown by the server page below.
 */
export function RequestWorkflow({
  transitions,
  assigneeUserId,
  handlers,
  setStatus,
  assign,
  addNote,
}: RequestWorkflowProps) {
  const t = useT("admin.requests.detail");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const [assignee, setAssignee] = useState(assigneeUserId ?? "");
  const [note, setNote] = useState("");

  function run(action: () => Outcome, after?: () => void) {
    start(async () => {
      const outcome = await action();
      const ok = outcome.ok && outcome.value === "ok";
      setResult(ok ? "saved" : "failed");
      if (ok) {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-8" data-testid="request-workflow">
      <section aria-labelledby="request-status-heading" className="grid gap-3">
        <h2 id="request-status-heading" className="font-heading text-fs-5 font-bold text-primary">
          {t("workflowHeading")}
        </h2>
        <div className="flex flex-wrap gap-3">
          {transitions.map((tr) => (
            <Button
              key={tr.status}
              type="button"
              variant={tr.status === "lezart" ? "secondary" : "primary"}
              disabled={pending}
              onClick={() => run(() => setStatus(tr.status))}
              data-testid={`status-${tr.status}`}
            >
              {tr.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t("assignee")}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            options={[
              { value: "", label: t("unassign") },
              ...handlers.map((h) => ({ value: h.id, label: h.name })),
            ]}
            wrapperClassName="min-w-64"
            data-testid="assignee-select"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => assign(assignee === "" ? null : assignee))}
            data-testid="assign-save"
          >
            {t("assign")}
          </Button>
        </div>
        <div aria-live="polite" data-testid="workflow-result">
          {result === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
          {result === "failed" ? <Alert tone="danger">{t("failed")}</Alert> : null}
        </div>
      </section>

      <form
        className="grid max-w-prose gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim() === "") return;
          run(
            () => addNote(note.trim()),
            () => setNote(""),
          );
        }}
        data-testid="note-form"
      >
        <Textarea
          label={t("noteLabel")}
          help={t("noteHelp")}
          rows={3}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div>
          <Button type="submit" variant="secondary" disabled={pending || note.trim() === ""}>
            {t("noteAdd")}
          </Button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Checkbox, Input, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/admin/content-form";
import type { PolicyResult } from "@/server/policy";

type Outcome = "ok" | "invalid" | "conflict";
type FormAction = (
  previous: FormState,
  form: FormData,
) => Promise<PolicyResult<FormState | undefined>>;

/** One lifecycle button (*Átvétel*, *Jóváhagyási lánc indítása*, *Lezárás*). */
export function StepButton({
  run,
  children,
  testId,
  variant = "primary",
}: {
  run: () => Promise<PolicyResult<Outcome>>;
  children: ReactNode;
  testId: string;
  variant?: "primary" | "secondary";
}) {
  const t = useT("munkater.hr.controls");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        data-testid={testId}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const result = await run();
            if (result.ok && result.value === "ok") router.refresh();
            else setFailed(true);
          })
        }
      >
        {children}
      </Button>
      {failed ? (
        <Alert tone="danger" role="alert" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

/** Approve / reject the waiting chain step, with an optional comment. */
export function DecisionForm({
  decide,
}: {
  decide: (decision: "approved" | "rejected", comment: string) => Promise<PolicyResult<Outcome>>;
}) {
  const t = useT("munkater.hr.controls");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comment, setComment] = useState("");
  const [failed, setFailed] = useState(false);
  const send = (decision: "approved" | "rejected") =>
    start(async () => {
      setFailed(false);
      const result = await decide(decision, comment);
      if (result.ok && result.value === "ok") router.refresh();
      else setFailed(true);
    });
  return (
    <div className="flex flex-col gap-3" data-testid="decision-form">
      <Textarea
        name="comment"
        label={t("comment")}
        optionalLabel={t("optional")}
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() => send("approved")}
          data-testid="approve"
        >
          {t("approve")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => send("rejected")}
          data-testid="reject"
        >
          {t("reject")}
        </Button>
      </div>
      {failed ? (
        <Alert tone="danger" role="alert" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

function useFormAction(action: FormAction) {
  return useActionState<FormState, FormData>(async (previous, form) => {
    const result = await action(previous, form);
    return result.ok ? (result.value ?? INITIAL_FORM_STATE) : { status: "denied" };
  }, INITIAL_FORM_STATE);
}

/** Reply to the requester / handlers; handlers may write an internal note and attach a file. */
export function ReplyForm({
  action,
  canNote,
  grant,
  canAttach = true,
}: {
  action: FormAction;
  canNote: boolean;
  grant?: string;
  /** The diocesan portal does not attach library documents of a parish. */
  canAttach?: boolean;
}) {
  const t = useT("munkater.hr.controls");
  const [state, formAction, pending] = useFormAction(action);
  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3" data-testid="reply-form">
      {grant ? <input type="hidden" name="grant" value={grant} /> : null}
      {state.status === "denied" ? (
        <Alert tone="danger" role="alert" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
      <Textarea name="body" label={t("message")} rows={3} required error={errors["body"]} />
      <div className="flex flex-wrap gap-6">
        {canAttach ? <Checkbox name="attach" label={t("attach")} help={t("attachHelp")} /> : null}
        {canNote ? (
          <Checkbox name="internal" label={t("internal")} help={t("internalHelp")} />
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="self-start" data-testid="reply-submit">
        {t("send")}
      </Button>
    </form>
  );
}

/** *Betekintés oka* before a confidential ticket opens (D-74). */
export function ReasonForm({ action }: { action: FormAction }) {
  const t = useT("munkater.hr.confidential");
  const [state, formAction, pending] = useFormAction(action);
  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form
      action={formAction}
      noValidate
      className="flex max-w-xl flex-col gap-3"
      data-testid="reason-form"
    >
      <Textarea
        name="reason"
        label={t("reason")}
        help={t("reasonHelp")}
        rows={3}
        required
        error={errors["reason"]}
      />
      <Button type="submit" disabled={pending} className="self-start" data-testid="reason-submit">
        {t("open")}
      </Button>
    </form>
  );
}

/** *Átadás*: hand the ticket to an external body; it becomes read-only. */
export function HandoverForm({ action }: { action: FormAction }) {
  const t = useT("munkater.hr.confidential");
  const [state, formAction, pending] = useFormAction(action);
  const errors = state.status === "invalid" ? state.errors : {};
  return (
    <form
      action={formAction}
      noValidate
      className="flex max-w-xl flex-col gap-3"
      data-testid="handover-form"
    >
      <Input name="recipient" label={t("recipient")} required error={errors["recipient"]} />
      <Textarea name="summary" label={t("summary")} optionalLabel={t("optional")} rows={2} />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="self-start"
        data-testid="handover-submit"
      >
        {t("handover")}
      </Button>
    </form>
  );
}

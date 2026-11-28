import { renderEmail, renderPush } from "@churchy/email";
import type { ReactNode } from "react";
import { Alert, Badge, FormattedDate, FormattedTime } from "@churchy/ui";
import { emailContextFor } from "@/server/email-context";
import type { OutboxMessage } from "@/server/data-adapters";

export interface OutboxDetailLabels {
  heading: string;
  time: string;
  channel: string;
  recipient: string;
  church: string;
  template: string;
  subject: string;
  link: string;
  noLink: string;
  noChurch: string;
  emailPreview: string;
  emailFrameTitle: string;
  plainTextHeading: string;
  pushPreview: string;
  pushTitle: string;
  pushBody: string;
  renderFailed: string;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-fs-2 font-semibold text-muted">{label}</dt>
      <dd className="text-fs-3 break-words">{children}</dd>
    </div>
  );
}

/**
 * One outbox message in full: its metadata, then the real rendering. Emails go through the same
 * React Email pipeline the sending worker will use and are shown in a sandboxed iframe (no
 * scripts, no navigation, no same-origin access); pushes show their title and body.
 */
export async function OutboxDetail({
  message,
  baseUrl,
  channelLabel,
  recipientLabel,
  templateLabel,
  labels,
}: {
  message: OutboxMessage;
  baseUrl: string;
  channelLabel: string;
  recipientLabel: string;
  templateLabel: string;
  labels: OutboxDetailLabels;
}) {
  const ctx = emailContextFor(message, baseUrl);
  let email: Awaited<ReturnType<typeof renderEmail>> | null = null;
  let push: ReturnType<typeof renderPush> | null = null;
  let failed = false;
  try {
    if (message.channel === "email")
      email = await renderEmail(message.template, message.params, ctx);
    else push = renderPush(message.template, message.params, ctx);
  } catch {
    failed = true;
  }
  const link = email?.link ?? push?.link ?? null;

  return (
    <section
      aria-labelledby="outbox-detail-heading"
      data-testid="outbox-detail"
      className="min-w-0 rounded-lg border border-border bg-surface-raised p-4 shadow-card sm:p-6"
    >
      <h2 id="outbox-detail-heading" className="font-heading text-fs-5 font-bold">
        {labels.heading}
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={labels.time}>
          <FormattedDate value={message.at} format="short" /> <FormattedTime value={message.at} />
        </Field>
        <Field label={labels.channel}>
          <Badge tone={message.channel === "email" ? "info" : "neutral"}>{channelLabel}</Badge>
        </Field>
        <Field label={labels.recipient}>{recipientLabel}</Field>
        <Field label={labels.church}>{message.tenant?.name ?? labels.noChurch}</Field>
        <Field label={labels.template}>{templateLabel}</Field>
        <Field label={labels.subject}>{email?.subject ?? push?.title ?? ""}</Field>
        <Field label={labels.link}>
          {link ? <code className="text-fs-2 break-all">{link}</code> : labels.noLink}
        </Field>
      </dl>

      {failed ? (
        <Alert tone="danger" className="mt-6">
          {labels.renderFailed}
        </Alert>
      ) : null}

      {email ? (
        <div className="mt-6 grid gap-4">
          <h3 className="text-fs-1 font-bold tracking-[0.14em] text-muted uppercase">
            {labels.emailPreview}
          </h3>
          <iframe
            title={labels.emailFrameTitle}
            sandbox=""
            srcDoc={email.html}
            data-testid="email-preview"
            className="h-[640px] w-full rounded-md border-2 border-border-strong bg-surface-raised"
          />
          <details>
            <summary className="cursor-pointer text-fs-3 font-semibold">
              {labels.plainTextHeading}
            </summary>
            <pre
              data-testid="email-plain-text"
              className="mt-3 overflow-x-auto rounded-md bg-surface-sunken p-4 text-fs-2 whitespace-pre-wrap"
            >
              {email.text}
            </pre>
          </details>
        </div>
      ) : null}

      {push ? (
        <div className="mt-6 grid gap-4">
          <h3 className="text-fs-1 font-bold tracking-[0.14em] text-muted uppercase">
            {labels.pushPreview}
          </h3>
          <div
            data-testid="push-preview"
            className="max-w-sm rounded-lg border-2 border-border-strong bg-surface-raised p-4 shadow-card"
          >
            <p className="sr-only">{labels.pushTitle}</p>
            <p className="text-fs-3 font-bold">{push.title}</p>
            <p className="sr-only">{labels.pushBody}</p>
            <p className="mt-1 text-fs-3">{push.body}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

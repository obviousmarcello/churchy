import { notFound } from "next/navigation";
import { Alert, Badge, FormattedDate, FormattedTime } from "@churchy/ui";
import { slaStatus } from "@churchy/hr";
import type { HrCategory, HrTicket } from "@churchy/contracts";
import { SlaBadge, StatusBadge } from "@/components/hr/badges";
import {
  DecisionForm,
  HandoverForm,
  ReasonForm,
  ReplyForm,
  StepButton,
} from "@/components/hr/ticket-controls";
import { getT } from "@/i18n/server";
import { displayValue } from "@/lib/requests/form";
import {
  accessOf,
  approvalRoute,
  categoryOf,
  chainOf,
  getHrEnv,
  mayView,
  personLabel,
  type HrEnv,
} from "@/server/hr";
import {
  closeTicket,
  decideAsHr,
  decideAsManager,
  handOverTicket,
  openConfidential,
  replyTicket,
  startApproval,
  takeTicket,
} from "@/server/hr-actions";
import { activeGrant, readsOfTicket } from "@/server/hr-audit";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.hr.detail"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const H2 = "font-heading text-fs-5 font-bold text-primary";

/** One HR ticket: data, approval chain, thread, attachments, history and the allowed actions. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, env] = await Promise.all([params, searchParams, getHrEnv()]);
  const ticket = await env.repos.hr.getTicket(env.ctx, id);
  const category = ticket === null ? undefined : categoryOf(env, ticket);
  if (ticket === null || category === undefined) notFound();
  const access = accessOf(env, ticket, category);
  // Anyone else (the leader, other HR handlers, platform support) gets the same 404.
  if (!mayView(access)) notFound();

  // Confidential tickets open only after a reason was given (D-74).
  const personId = env.me?.personId ?? "";
  const grantId = typeof query["betekintes"] === "string" ? query["betekintes"] : undefined;
  const needsReason = ticket.confidential && !access.mine;
  const grant = needsReason ? activeGrant(grantId, ticket.id, personId, env.now) : undefined;
  if (needsReason && grant === undefined) {
    const t = await getT("munkater.hr.confidential");
    return (
      <div className="flex flex-col gap-5" data-testid="hr-gate">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("gateTitle")}
        </h1>
        <Alert tone="warning" title={t("gateAlert")}>
          <p>{t("gateBody")}</p>
        </Alert>
        <ReasonForm action={openConfidential.bind(null, ticket.id)} />
      </div>
    );
  }
  return (
    <TicketView
      env={env}
      ticket={ticket}
      category={category}
      grant={grant?.id}
      justSent={query["elkuldve"] === "1"}
    />
  );
}

async function TicketView({
  env,
  ticket,
  category,
  grant,
  justSent,
}: {
  env: HrEnv;
  ticket: HrTicket;
  category: HrCategory;
  grant: string | undefined;
  justSent: boolean;
}) {
  const [t, status, controls, conf] = await Promise.all([
    getT("munkater.hr.detail"),
    getT("munkater.hr.status"),
    getT("munkater.hr.controls"),
    getT("munkater.hr.confidential"),
  ]);
  const access = accessOf(env, ticket, category);
  const { repos, ctx } = env;
  const [messages, approvals, absences] = await Promise.all([
    repos.hr.listMessages(ctx, ticket.id, { includeInternal: access.handle }),
    repos.hr.listApprovals(ctx, ticket.id),
    repos.absences.list(ctx, { from: "2000-01-01", to: "2100-01-01" }),
  ]);
  const mediaIds = [...new Set(messages.flatMap((m) => m.attachmentMediaIds))];
  const media = mediaIds.length > 0 ? await repos.media.getMany(ctx, mediaIds) : [];
  const absence = absences.find((a) => a.ticketId === ticket.id);
  const { steps, progress } = chainOf(env, ticket, category, approvals);
  const route =
    ticket.status === "jovahagyasra_var" && progress.state === "waiting"
      ? approvalRoute(env, progress.step, access)
      : null;
  const sla = slaStatus(
    { createdAt: ticket.createdAt, slaHours: category.slaHours, closedAt: ticket.closedAt },
    env.now,
    env.calendar,
  );
  const handed = ticket.handover !== null;
  const canAct = access.handle && !handed;

  // Status history, derived from what happened to the ticket.
  const history = [
    { at: ticket.createdAt, text: t("historyCreated") },
    ...approvals.map((a) => ({
      at: a.decidedAt,
      text: t("historyApproval", {
        decision: t(`decision.${a.decision}`),
        step: a.step + 1,
        name: personLabel(env, a.approverPersonId),
      }),
    })),
    ...(ticket.closedAt === null ? [] : [{ at: ticket.closedAt, text: t("historyClosed") }]),
    ...(ticket.handover === null
      ? []
      : [
          {
            at: `${ticket.handover.date}T12:00:00Z`,
            text: t("historyHandover", { recipient: ticket.handover.recipient }),
          },
        ]),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const reads = ticket.confidential && access.handle ? readsOfTicket(env.tenantId, ticket.id) : [];

  return (
    <div
      className="flex max-w-3xl flex-col gap-6"
      data-testid="hr-ticket"
      data-reference={ticket.reference}
    >
      <header className="flex flex-col gap-2">
        <p className="font-mono text-fs-3 text-muted" data-testid="ticket-reference">
          {ticket.reference}
        </p>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {ticket.subject}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <SlaBadge sla={sla} />
          <Badge>{category.name}</Badge>
          {ticket.confidential ? <Badge tone="warning">{t("confidential")}</Badge> : null}
          {handed ? <Badge tone="neutral">{t("readOnly")}</Badge> : null}
        </div>
        <p className="text-muted">
          {ticket.anonymous
            ? t("anonymousRequester")
            : t("requester", { name: personLabel(env, ticket.requesterPersonId) })}
          {sla.dueAt !== null ? (
            <>
              {" · "}
              {t("due")} <FormattedDate format="short" value={sla.dueAt} />{" "}
              <FormattedTime value={sla.dueAt} />
            </>
          ) : null}
        </p>
      </header>

      {justSent ? (
        <Alert tone="success" title={t("sentTitle")} role="status">
          <p>{t("sentBody", { reference: ticket.reference })}</p>
        </Alert>
      ) : null}
      {handed && ticket.handover ? (
        <Alert tone="info" title={conf("handedTitle")}>
          <p>
            {conf("handedBody", { recipient: ticket.handover.recipient })}{" "}
            <FormattedDate format="long" value={ticket.handover.date} />
          </p>
          {ticket.handover.summary !== "" ? <p>{ticket.handover.summary}</p> : null}
        </Alert>
      ) : null}

      <section aria-labelledby="t-data" className="flex flex-col gap-2">
        <h2 id="t-data" className={H2}>
          {t("details")}
        </h2>
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {category.fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="font-bold">{f.label}</dt>
              <dd>
                {f.type === "date" && typeof ticket.data[f.key] === "string" ? (
                  <FormattedDate format="long" value={ticket.data[f.key] as string} />
                ) : (
                  displayValue(f, ticket.data[f.key], { yes: t("yes"), no: t("no"), none: "–" })
                )}
              </dd>
            </div>
          ))}
          {absence ? (
            <div className="contents" data-testid="ticket-absence">
              <dt className="font-bold">{t("absence")}</dt>
              <dd>
                <FormattedDate format="short" value={absence.startDate} /> –{" "}
                <FormattedDate format="short" value={absence.endDate} />{" "}
                {t("workingDays", { count: absence.workingDays })}
                {absence.status === "approved" ? (
                  <Badge tone="success" className="ml-2">
                    {t("absenceApproved")}
                  </Badge>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {steps.length > 0 ? (
        <section
          aria-labelledby="t-chain"
          className="flex flex-col gap-2"
          data-testid="approval-chain"
        >
          <h2 id="t-chain" className={H2}>
            {t("chain")}
          </h2>
          <ol className="flex flex-col gap-2">
            {steps.map((s) => {
              const decision = approvals.find(
                (a) => a.step === s.index && a.decision !== "delegated",
              );
              const delegated = approvals.some(
                (a) => a.step === s.index && a.decision === "delegated",
              );
              const current =
                progress.state === "waiting" &&
                progress.step.index === s.index &&
                ticket.status === "jovahagyasra_var";
              return (
                <li
                  key={s.index}
                  className="rounded-control border border-hairline p-3"
                  data-testid="chain-step"
                  data-outcome={s.outcome}
                  aria-current={current ? "step" : undefined}
                >
                  <p className="font-bold">
                    {t("stepLabel", { n: s.index + 1 })} ·{" "}
                    {t(`step.${s.step.kind === "role" ? s.step.role : s.step.kind}`)}
                  </p>
                  <p className="text-muted">
                    {s.outcome === "skippedSelf"
                      ? t("outcome.skippedSelf")
                      : s.outcome === "routedToHr"
                        ? t("outcome.routedToHr")
                        : s.outcome === "delegated" || delegated
                          ? t("outcome.delegated")
                          : null}{" "}
                    {s.approverIds.map((p) => personLabel(env, p)).join(", ")}
                  </p>
                  {decision ? (
                    <p>
                      <Badge tone={decision.decision === "approved" ? "success" : "danger"}>
                        {t(`decision.${decision.decision}`)}
                      </Badge>{" "}
                      {personLabel(env, decision.approverPersonId)}
                      {decision.comment ? ` — ${decision.comment}` : ""}
                    </p>
                  ) : current ? (
                    <Badge tone="warning">{t("waiting")}</Badge>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {route !== null || canAct ? (
        <section
          aria-labelledby="t-actions"
          className="flex flex-col gap-3"
          data-testid="ticket-actions"
        >
          <h2 id="t-actions" className={H2}>
            {controls("title")}
          </h2>
          {route !== null ? (
            <DecisionForm
              decide={(route === "manager" ? decideAsManager : decideAsHr).bind(null, ticket.id)}
            />
          ) : null}
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              {ticket.status === "uj" ? (
                <StepButton run={takeTicket.bind(null, ticket.id)} testId="take">
                  {controls("take")}
                </StepButton>
              ) : null}
              {ticket.status === "folyamatban" && category.approvalChain.length > 0 ? (
                <StepButton run={startApproval.bind(null, ticket.id)} testId="start-approval">
                  {controls("startApproval")}
                </StepButton>
              ) : null}
              {["folyamatban", "jovahagyva", "elutasitva"].includes(ticket.status) ? (
                <StepButton
                  run={closeTicket.bind(null, ticket.id)}
                  testId="close"
                  variant="secondary"
                >
                  {controls("close")}
                </StepButton>
              ) : null}
            </div>
          ) : null}
          {canAct && ticket.confidential && ticket.status !== "lezart" ? (
            <HandoverForm action={handOverTicket.bind(null, ticket.id)} />
          ) : null}
        </section>
      ) : null}

      <section
        aria-labelledby="uzenetek"
        id="uzenetek"
        className="flex flex-col gap-3"
        data-testid="thread"
      >
        <h2 id="uzenetek" className={H2}>
          {t("thread")}
        </h2>
        {messages.length === 0 ? <p className="text-muted">{t("noMessages")}</p> : null}
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded-card border border-hairline bg-surface-raised shadow-xs p-3"
              data-testid="message"
              data-internal={m.internal}
            >
              <p className="flex flex-wrap items-center gap-2 text-muted">
                <strong className="text-text">
                  {m.authorPersonId === null
                    ? t("anonymousAuthor")
                    : personLabel(env, m.authorPersonId)}
                </strong>
                <FormattedDate format="relative" value={m.createdAt} now={env.now} />
                {m.internal ? (
                  <Badge tone="warning" data-testid="internal-note">
                    {t("internalNote")}
                  </Badge>
                ) : null}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
              {m.attachmentMediaIds.length > 0 ? (
                <p className="text-muted" data-testid="attachment">
                  {t("attachment")}:{" "}
                  {media
                    .filter((x) => m.attachmentMediaIds.includes(x.id))
                    .map((x) => x.filename)
                    .join(", ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {!handed && (access.read || access.handle) ? (
          <ReplyForm
            action={replyTicket.bind(null, ticket.id)}
            canNote={access.handle && !access.mine}
            grant={grant}
          />
        ) : null}
      </section>

      <section aria-labelledby="t-history" className="flex flex-col gap-2" data-testid="history">
        <h2 id="t-history" className={H2}>
          {t("history")}
        </h2>
        <ol className="flex flex-col gap-1">
          {history.map((h, i) => (
            <li key={i}>
              <FormattedDate format="short" value={h.at} /> <FormattedTime value={h.at} /> —{" "}
              {h.text}
            </li>
          ))}
        </ol>
        <p className="text-muted">{t("statusNow", { status: status(ticket.status) })}</p>
      </section>

      {reads.length > 0 ? (
        <section aria-labelledby="t-reads" className="flex flex-col gap-2" data-testid="read-log">
          <h2 id="t-reads" className={H2}>
            {conf("readLog")}
          </h2>
          <ul>
            {reads.map((r) => (
              <li key={r.id}>
                <FormattedDate format="short" value={r.at} /> <FormattedTime value={r.at} /> —{" "}
                {personLabel(env, r.personId)}: {r.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, FormattedDate, FormattedTime } from "@churchy/ui";
import { canTransition } from "@churchy/hr";
import { can } from "@churchy/policy";
import { SlaBadge, StatusBadge } from "@/components/hr/badges";
import { ReplyForm, StepButton } from "@/components/hr/ticket-controls";
import { getT } from "@/i18n/server";
import { displayValue } from "@/lib/requests/form";
import { getOrgHrEnv, orgTicketResource } from "@/server/org-hr";
import { closeOrgTicket, replyOrgTicket, takeOrgTicket } from "@/server/org-hr-actions";
import { logOrgAccess } from "@/server/org-audit";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("portal.ticket"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const H2 = "font-heading text-fs-5 font-bold text-primary";

/**
 * One ticket of a linked parish in the diocesan portal (D-85): data, thread, history and the
 * actions the policy allows an organization actor. A ticket outside the delegation, the actor's
 * scope or the link — and every confidential ticket — is a plain 404.
 */
export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, env] = await Promise.all([params, getOrgHrEnv()]);
  if (env === null) notFound();
  const row = env.rows.find((r) => r.ticket.id === id);
  if (row === undefined) notFound();
  const { ticket, category, parish, sla } = row;
  const resource = orgTicketResource(ticket, category);
  const handle = can(env.actor, "hr.ticket.handle", resource);
  const reply = can(env.actor, "hr.ticket.reply", resource);
  const handed = ticket.handover !== null;

  const [t, controls, messages, absences] = await Promise.all([
    getT("portal.ticket"),
    getT("munkater.hr.controls"),
    env.repos.hr.listMessages(env.ctx, ticket.id, { includeInternal: handle }),
    env.repos.absences.list(env.ctx, { from: "2000-01-01", to: "2100-01-01" }),
  ]);
  const detail = await getT("munkater.hr.detail");
  const absence = absences.find((a) => a.ticketId === ticket.id);
  // The parish's access log gets one entry per opening, with the organization as actor.
  await logOrgAccess(
    { tenantId: ticket.tenantId, orgId: env.orgId, reference: ticket.reference, kind: "read" },
    env.now,
  );
  const author = (personId: string | null): string =>
    personId === null
      ? t("authorOrg")
      : personId === ticket.requesterPersonId
        ? t("authorRequester")
        : t("authorParish");

  return (
    <div
      className="flex max-w-3xl flex-col gap-6"
      data-testid="portal-ticket"
      data-reference={ticket.reference}
    >
      <p>
        <Link
          href="/egyhazmegye/kerelmek"
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          {t("back")}
        </Link>
      </p>
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
          <Badge data-testid="ticket-parish">{parish}</Badge>
          <Badge>{category.name}</Badge>
          {handed ? <Badge tone="neutral">{t("readOnly")}</Badge> : null}
        </div>
        <p className="text-muted">
          {ticket.anonymous
            ? detail("anonymousRequester")
            : row.requester === ""
              ? t("requesterUnknown")
              : t("requesterPosition", { position: row.requester })}
          {sla.dueAt !== null ? (
            <>
              {" · "}
              {detail("due")} <FormattedDate format="short" value={sla.dueAt} />{" "}
              <FormattedTime value={sla.dueAt} />
            </>
          ) : null}
        </p>
      </header>

      <Alert tone="info" title={t("scopeTitle")}>
        <p>{t("scopeBody", { parish, category: category.name })}</p>
        {ticket.status === "jovahagyasra_var" ? <p>{t("approvalAtParish")}</p> : null}
      </Alert>

      <section aria-labelledby="t-data" className="flex flex-col gap-2">
        <h2 id="t-data" className={H2}>
          {detail("details")}
        </h2>
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {category.fields.map((f) => (
            <div key={f.key} className="contents">
              <dt className="font-bold">{f.label}</dt>
              <dd>
                {f.type === "date" && typeof ticket.data[f.key] === "string" ? (
                  <FormattedDate format="long" value={ticket.data[f.key] as string} />
                ) : (
                  displayValue(f, ticket.data[f.key], {
                    yes: detail("yes"),
                    no: detail("no"),
                    none: "–",
                  })
                )}
              </dd>
            </div>
          ))}
          {absence ? (
            <div className="contents" data-testid="ticket-absence">
              <dt className="font-bold">{detail("absence")}</dt>
              <dd>
                <FormattedDate format="short" value={absence.startDate} /> –{" "}
                <FormattedDate format="short" value={absence.endDate} />{" "}
                {detail("workingDays", { count: absence.workingDays })}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {handle && !handed ? (
        <section
          aria-labelledby="t-actions"
          className="flex flex-col gap-3"
          data-testid="ticket-actions"
        >
          <h2 id="t-actions" className={H2}>
            {controls("title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {ticket.status === "uj" ? (
              <StepButton run={takeOrgTicket.bind(null, ticket.id)} testId="take">
                {controls("take")}
              </StepButton>
            ) : null}
            {canTransition(ticket.status, "lezart") ? (
              <StepButton
                run={closeOrgTicket.bind(null, ticket.id)}
                testId="close"
                variant="secondary"
              >
                {controls("close")}
              </StepButton>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="uzenetek"
        id="uzenetek"
        className="flex flex-col gap-3"
        data-testid="thread"
      >
        <h2 id="uzenetek" className={H2}>
          {detail("thread")}
        </h2>
        {messages.length === 0 ? <p className="text-muted">{detail("noMessages")}</p> : null}
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-border bg-surface-raised p-3"
              data-testid="message"
              data-internal={m.internal}
            >
              <p className="flex flex-wrap items-center gap-2 text-muted">
                <strong className="text-text">{author(m.authorPersonId)}</strong>
                <FormattedDate format="relative" value={m.createdAt} now={env.now} />
                {m.internal ? (
                  <Badge tone="warning" data-testid="internal-note">
                    {detail("internalNote")}
                  </Badge>
                ) : null}
              </p>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
        {!handed && reply ? (
          <ReplyForm
            action={replyOrgTicket.bind(null, ticket.id)}
            canNote={handle}
            canAttach={false}
          />
        ) : null}
      </section>
    </div>
  );
}

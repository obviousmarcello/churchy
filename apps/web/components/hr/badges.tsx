import Link from "next/link";
import { Badge, FormattedDate, type BadgeTone } from "@churchy/ui";
import type { HrTicket } from "@churchy/contracts";
import type { SlaStatus, TicketStatus } from "@churchy/hr";
import { getT } from "@/i18n/server";

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  uj: "info",
  folyamatban: "primary",
  jovahagyasra_var: "warning",
  jovahagyva: "success",
  elutasitva: "danger",
  lezart: "neutral",
};

export async function StatusBadge({ status }: { status: TicketStatus }) {
  const t = await getT("munkater.hr.status");
  return (
    <Badge tone={STATUS_TONE[status]} data-testid="ticket-status" data-status={status}>
      {t(status)}
    </Badge>
  );
}

const SLA_TONE = {
  none: "neutral",
  ok: "success",
  reminder: "warning",
  overdue: "danger",
  metOnTime: "success",
  metLate: "danger",
} as const satisfies Record<SlaStatus["state"], BadgeTone>;

/** SLA badge (D-72): state in words, never colour alone. Nothing for tickets without an SLA. */
export async function SlaBadge({ sla }: { sla: SlaStatus }) {
  if (sla.state === "none") return null;
  const t = await getT("munkater.hr.sla");
  return (
    <Badge tone={SLA_TONE[sla.state]} data-testid="sla-badge" data-sla={sla.state}>
      {t(sla.state)}
    </Badge>
  );
}

/** One row of a ticket list. */
export async function TicketRow({
  ticket,
  category,
  requester,
  sla,
  now,
  href,
  parish,
}: {
  ticket: HrTicket;
  category: string;
  requester: string;
  sla: SlaStatus;
  now: Date;
  /** Detail page; the workspace inbox by default. */
  href?: string;
  /** The parish of the ticket (diocesan inbox). */
  parish?: string;
}) {
  const t = await getT("munkater.hr.list");
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised p-4"
      data-testid="ticket-row"
      data-reference={ticket.reference}
    >
      <Link
        href={href ?? `/munkater/hr/${ticket.id}`}
        className="inline-flex min-h-11 items-center font-heading text-fs-4 font-bold text-primary"
      >
        <span className="mr-2 font-mono text-fs-3">{ticket.reference}</span>
        {ticket.subject}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <SlaBadge sla={sla} />
        {parish !== undefined && parish !== "" ? (
          <Badge data-testid="ticket-parish">{parish}</Badge>
        ) : null}
        <span className="text-muted">{category}</span>
        {requester !== "" ? <span className="text-muted">· {requester}</span> : null}
        {ticket.anonymous ? <span className="text-muted">· {t("anonymous")}</span> : null}
        <span className="text-muted">
          · <FormattedDate format="relative" value={ticket.createdAt} now={now} />
        </span>
      </div>
    </li>
  );
}

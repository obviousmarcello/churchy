import { notFound } from "next/navigation";
import { Alert } from "@churchy/ui";
import { leaveBalance, REGULAR_LEAVE } from "@churchy/hr";
import { can } from "@churchy/policy";
import { TicketForm } from "@/components/hr/ticket-form";
import { getT } from "@/i18n/server";
import { submitTicket } from "@/server/hr-actions";
import { getHrEnv } from "@/server/hr";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.hr.new"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** Submission form of one HR category (D-71); absence categories get the working-day calculator. */
export default async function NewTicketFormPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const [env, t] = await Promise.all([getHrEnv(), getT("munkater.hr.new")]);
  const category = env.categories.find((c) => c.id === categoryId && c.active);
  if (
    category === undefined ||
    !can(env.actor, "hr.ticket.create", {
      tenantId: env.tenantId,
      category: {
        id: category.id,
        key: category.key,
        confidential: category.confidential,
        whoCanSubmit: category.whoCanSubmit,
      },
    })
  ) {
    notFound();
  }
  const personId = env.me?.personId ?? null;
  let absence = null;
  if (category.createsAbsence && personId !== null) {
    const year = Number(env.today.slice(0, 4));
    const [entitlement, absences, ...calendars] = await Promise.all([
      env.repos.absences.getEntitlement(env.ctx, personId, year),
      env.repos.absences.list(env.ctx, {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        personIds: [personId],
      }),
      ...[year - 1, year, year + 1].map((y) => env.repos.absences.listWorkdayCalendar(env.ctx, y)),
    ]);
    const mayBalance = can(env.actor, "hr.leaveBalance.view", { tenantId: env.tenantId, personId });
    absence = {
      weekdays: env.profiles.get(personId)?.workPattern.weekdays ?? [1, 2, 3, 4, 5],
      calendar: calendars.flat(),
      remaining:
        category.absenceType === REGULAR_LEAVE && mayBalance
          ? leaveBalance(year, entitlement, absences).remaining
          : null,
    };
  }
  return (
    <div className="flex flex-col gap-5" data-testid="hr-ticket-new">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {category.name}
        </h1>
        {category.confidential ? (
          <Alert tone="info" title={t("confidentialTitle")} className="mt-3">
            <p>{t("confidentialBody")}</p>
          </Alert>
        ) : null}
      </header>
      <TicketForm
        action={submitTicket.bind(null, category.id)}
        fields={category.fields}
        absence={absence}
        allowAnonymous={category.allowAnonymous}
        cancelHref="/munkater/hr"
      />
    </div>
  );
}

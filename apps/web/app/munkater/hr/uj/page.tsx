import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@churchy/ui";
import { can } from "@churchy/policy";
import { getT } from "@/i18n/server";
import { getHrEnv } from "@/server/hr";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.hr.new"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** New request: the categories this actor may submit to (`hr.ticket.create`). */
export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, query] = await Promise.all([getHrEnv(), getT("munkater.hr.new"), searchParams]);
  const absenceOnly = query["tipus"] === "tavollet";
  const choices = env.categories.filter(
    (c) =>
      c.active &&
      (!absenceOnly || c.createsAbsence) &&
      can(env.actor, "hr.ticket.create", {
        tenantId: env.tenantId,
        category: {
          id: c.id,
          key: c.key,
          confidential: c.confidential,
          whoCanSubmit: c.whoCanSubmit,
        },
      }),
  );
  if (choices.length === 0) notFound();
  return (
    <div className="flex flex-col gap-5" data-testid="hr-new-page">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {absenceOnly ? t("absenceTitle") : t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      <ul className="grid gap-3 md:grid-cols-2">
        {choices.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
            data-testid="category-card"
          >
            <Link
              href={`/munkater/hr/uj/${c.id}`}
              className="inline-flex min-h-11 items-center font-heading text-fs-5 font-bold text-primary"
            >
              {c.name}
            </Link>
            <div className="flex flex-wrap gap-2">
              {c.confidential ? <Badge tone="warning">{t("confidential")}</Badge> : null}
              {c.approvalChain.length > 0 ? <Badge>{t("needsApproval")}</Badge> : null}
              {c.allowAnonymous ? <Badge tone="info">{t("anonymousPossible")}</Badge> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

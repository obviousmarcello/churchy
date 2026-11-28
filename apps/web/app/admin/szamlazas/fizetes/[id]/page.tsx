import { notFound } from "next/navigation";
import { formatHuf } from "@churchy/hu";
import { Alert, ButtonLink } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { getT } from "@/i18n/server";
import { findInvoice } from "@/server/billing-admin";
import { mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.billing.barion"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/**
 * The fictitious *Barion* payment page of the demo (D-88). It has no card form and no payment
 * code: the button only leads on to the confirmation page. The real payment (Barion sandbox)
 * belongs to the backend part of the deliverable.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, nav, t] = await Promise.all([
    params,
    getT("common.nav"),
    getT("admin.billing.barion"),
  ]);
  const label = nav("sections.billing");
  if (!(await mayOpen("billing"))) return <AdminPage title={t("title")} section="billing" />;
  const invoice = await findInvoice(id);
  if (invoice === null) notFound();
  return (
    <AdminPage
      title={t("title")}
      lead={t("lead")}
      section="billing"
      breadcrumbs={[{ label, href: "/admin/szamlazas" }, { label: t("title") }]}
      testId="barion-mock"
    >
      <Alert tone="warning" title={t("mockTitle")}>
        <p>{t("mockBody")}</p>
      </Alert>
      <dl className="grid max-w-md gap-2 rounded-md border-2 border-border-strong bg-surface-raised p-4">
        <div>
          <dt className="text-fs-2 text-muted">{t("merchant")}</dt>
          <dd className="font-semibold">{t("merchantName")}</dd>
        </div>
        <div>
          <dt className="text-fs-2 text-muted">{t("invoice")}</dt>
          <dd className="font-semibold" data-testid="barion-invoice">
            {invoice.number}
          </dd>
        </div>
        <div>
          <dt className="text-fs-2 text-muted">{t("amount")}</dt>
          <dd className="text-fs-5 font-bold" data-testid="barion-amount">
            {formatHuf(invoice.amount)}
          </dd>
        </div>
      </dl>
      <p className="max-w-prose text-muted">{t("noCardData")}</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          href={`/admin/szamlazas/fizetes/${invoice.id}/visszaigazolas`}
          data-testid="barion-confirm"
        >
          {t("confirm")}
        </ButtonLink>
        <ButtonLink href="/admin/szamlazas" variant="secondary">
          {t("cancel")}
        </ButtonLink>
      </div>
    </AdminPage>
  );
}

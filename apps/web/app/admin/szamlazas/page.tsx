import { formatHuf } from "@churchy/hu";
import { Alert, Badge, ButtonLink, FormattedDate, type BadgeTone } from "@churchy/ui";
import type { Invoice, Plan, Subscription } from "@churchy/contracts";
import { AdminPage, DataTable } from "@/components/admin";
import { EntityForm } from "@/components/admin/content/entity-form";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { billingFields, billingValues, getBillingView } from "@/server/billing-admin";
import { saveBillingDetailsAction } from "@/server/billing-actions";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.billing")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const INVOICE_TONE: Record<Invoice["status"], BadgeTone> = {
  proforma: "info",
  issued: "warning",
  paid: "success",
  void: "neutral",
};
const SUB_TONE: Record<Subscription["status"], BadgeTone> = {
  trialing: "info",
  active: "success",
  past_due: "danger",
  cancelled: "neutral",
};

/** *Számlázás* (D-88, demo depth): subscription, billing details, invoices, a fictitious Barion step. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, query] = await Promise.all([
    getT("common.nav"),
    getT("admin.billing"),
    searchParams,
  ]);
  const title = nav("sections.billing");
  if (!(await mayOpen("billing"))) return <AdminPage title={title} section="billing" />;
  const [view, { ctx, repos }] = await Promise.all([getBillingView(), adminData()]);
  const plans = await repos.billing.listPlans(ctx);
  const planName = (p: Plan["key"]) => plans.find((x) => x.key === p)?.name ?? "";
  const pastDue = view.subscriptions.some((s) => s.status === "past_due");

  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="billing"
      breadcrumbs={[{ label: title }]}
      testId="admin-billing"
      actions={
        <ButtonLink href="/admin/csomag" variant="secondary">
          {t("toPlan")}
        </ButtonLink>
      }
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      <Alert tone="info" title={t("mockTitle")}>
        <p>{t("mockNote")}</p>
      </Alert>

      {view.covered ? (
        <Alert tone="info" title={t("covered.title")} data-testid="billing-covered">
          <p>{t("covered.body")}</p>
        </Alert>
      ) : (
        <>
          {pastDue ? (
            <Alert tone="danger" title={t("dunning.title")} data-testid="billing-dunning">
              <p>{t("dunning.body")}</p>
            </Alert>
          ) : null}

          <section
            aria-labelledby="subs-h"
            className="flex flex-col gap-3"
            data-testid="billing-subscriptions"
          >
            <h2 id="subs-h" className="font-heading text-fs-5 font-bold text-primary">
              {t("subscriptions.title")}
            </h2>
            <DataTable<Subscription>
              caption={t("subscriptions.title")}
              captionHidden
              rows={view.subscriptions}
              rowKey={(s) => s.id}
              empty={t("subscriptions.empty")}
              columns={[
                {
                  key: "plan",
                  header: t("subscriptions.plan"),
                  rowHeader: true,
                  cell: (s) => planName(s.planKey),
                },
                {
                  key: "period",
                  header: t("subscriptions.period"),
                  cell: (s) => t(`period.${s.period}`),
                },
                {
                  key: "status",
                  header: t("subscriptions.status"),
                  cell: (s) => (
                    <Badge tone={SUB_TONE[s.status]}>{t(`subscriptionStates.${s.status}`)}</Badge>
                  ),
                },
                {
                  key: "end",
                  header: t("subscriptions.renews"),
                  cell: (s) => <FormattedDate value={s.currentPeriodEnd} />,
                },
              ]}
            />
          </section>

          <section
            aria-labelledby="inv-h"
            className="flex flex-col gap-3"
            data-testid="billing-invoices"
          >
            <h2 id="inv-h" className="font-heading text-fs-5 font-bold text-primary">
              {t("invoices.title")}
            </h2>
            <DataTable<Invoice>
              caption={t("invoices.title")}
              captionHidden
              testId="invoice-table"
              rows={view.invoices}
              rowKey={(i) => i.id}
              empty={t("invoices.empty")}
              columns={[
                {
                  key: "number",
                  header: t("invoices.number"),
                  rowHeader: true,
                  cell: (i) => i.number,
                },
                {
                  key: "issued",
                  header: t("invoices.issued"),
                  cell: (i) => <FormattedDate value={i.issuedAt} />,
                },
                {
                  key: "amount",
                  header: t("invoices.amount"),
                  align: "end",
                  cell: (i) => formatHuf(i.amount),
                },
                {
                  key: "status",
                  header: t("invoices.status"),
                  cell: (i) => (
                    <Badge tone={INVOICE_TONE[i.status]} data-testid="invoice-status">
                      {t(`invoiceStates.${i.status}`)}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  header: t("invoices.actions"),
                  align: "end",
                  cell: (i) =>
                    i.status === "paid" || i.status === "void" ? (
                      <span className="text-muted">–</span>
                    ) : (
                      <ButtonLink
                        href={`/admin/szamlazas/fizetes/${i.id}`}
                        size="sm"
                        aria-label={t("invoices.payAria", { number: i.number })}
                        data-testid="pay-barion"
                      >
                        {t("invoices.pay")}
                      </ButtonLink>
                    ),
                },
              ]}
            />
            <p className="text-fs-2 text-muted">{t("invoices.note")}</p>
          </section>

          <section
            aria-labelledby="details-h"
            className="flex flex-col gap-3"
            data-testid="billing-details"
          >
            <h2 id="details-h" className="font-heading text-fs-5 font-bold text-primary">
              {t("details.title")}
            </h2>
            <p className="text-muted">{t("details.lead")}</p>
            <EntityForm
              action={saveBillingDetailsAction}
              fields={await billingFields()}
              values={billingValues(view.account)}
              submitLabel={t("details.save")}
              cancelHref="/admin"
              testId="billing-form"
            />
          </section>
        </>
      )}
    </AdminPage>
  );
}

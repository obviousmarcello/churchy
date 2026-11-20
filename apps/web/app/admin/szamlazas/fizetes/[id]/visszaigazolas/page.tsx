import { notFound } from "next/navigation";
import { Alert, ButtonLink } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { getT } from "@/i18n/server";
import { findInvoice } from "@/server/billing-admin";
import { mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.billing.barion"), getT("common")]);
  return {
    title: `${t("doneTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Fictitious confirmation after the demo payment step: nothing was paid or changed (D-88). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, nav, t] = await Promise.all([
    params,
    getT("common.nav"),
    getT("admin.billing.barion"),
  ]);
  const label = nav("sections.billing");
  if (!(await mayOpen("billing"))) return <AdminPage title={t("doneTitle")} section="billing" />;
  const invoice = await findInvoice(id);
  if (invoice === null) notFound();
  return (
    <AdminPage
      title={t("doneTitle")}
      section="billing"
      breadcrumbs={[{ label, href: "/admin/szamlazas" }, { label: t("doneTitle") }]}
      testId="barion-done"
    >
      <Alert tone="success" title={t("doneHeading", { number: invoice.number })} role="status">
        <p>{t("doneBody")}</p>
      </Alert>
      <p>
        <ButtonLink href="/admin/szamlazas">{t("backToBilling")}</ButtonLink>
      </p>
    </AdminPage>
  );
}

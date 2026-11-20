import { redirect } from "next/navigation";
import {
  BillingAccountInputSchema,
  type BillingAccount,
  type Invoice,
  type Subscription,
} from "@churchy/contracts";
import { getT } from "@/i18n/server";
import {
  formValues,
  validate,
  type ErrorMessages,
  type FieldDef,
  type FormState,
} from "@/lib/admin/content-form";
import { adminData } from "@/server/content-admin";
import { entitlementsFor } from "@/server/plans";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Billing screens at demo depth (D-88): billing details, subscription and invoice list read
 * through `BillingRepo`. **No payment code**: the *Barion* button only opens a fictitious
 * confirmation page; Churchy never sees card data (SDD §19.2).
 */

export const BILLING_FIELDS = [
  "name",
  "taxNumber",
  "postalCode",
  "city",
  "line1",
  "email",
  "paymentMethod",
] as const;

export interface BillingView {
  /** The diocese (or another organization) pays: no own account. */
  covered: boolean;
  account: BillingAccount | null;
  subscriptions: Subscription[];
  invoices: Invoice[];
}

export async function getBillingView(): Promise<BillingView> {
  const { ctx, repos } = await adminData();
  const [ent, account, subscriptions, invoices] = await Promise.all([
    entitlementsFor(ctx),
    repos.billing.getBillingAccount(ctx),
    repos.billing.listSubscriptions(ctx),
    repos.billing.listInvoices(ctx),
  ]);
  return { covered: ent.coveredByDeal, account, subscriptions, invoices };
}

/** One invoice of the church's account (for the fictitious payment page), or null. */
export async function findInvoice(id: string): Promise<Invoice | null> {
  const { ctx, repos } = await adminData();
  return (await repos.billing.listInvoices(ctx)).find((i) => i.id === id) ?? null;
}

export function billingValues(account: BillingAccount | null): Record<string, string> {
  return {
    name: account?.name ?? "",
    taxNumber: account?.taxNumber ?? "",
    postalCode: account?.address.postalCode ?? "",
    city: account?.address.city ?? "",
    line1: account?.address.line1 ?? "",
    email: account?.email ?? "",
    paymentMethod: account?.paymentMethod ?? "card",
  };
}

export async function billingFields(): Promise<FieldDef[]> {
  const t = await getT("admin.billing.fields");
  return [
    { name: "name", label: t("name"), kind: "text", required: true },
    { name: "taxNumber", label: t("taxNumber"), help: t("taxNumberHelp"), kind: "text" },
    { name: "postalCode", label: t("postalCode"), kind: "text", required: true },
    { name: "city", label: t("city"), kind: "text", required: true },
    { name: "line1", label: t("line1"), kind: "text", required: true },
    { name: "email", label: t("email"), help: t("emailHelp"), kind: "email", required: true },
    {
      name: "paymentMethod",
      label: t("paymentMethod"),
      kind: "select",
      options: [
        { value: "card", label: t("card") },
        { value: "transfer", label: t("transfer") },
      ],
    },
  ];
}

async function errorMessages(): Promise<ErrorMessages> {
  const t = await getT("admin.content.errors");
  return {
    required: t("required"),
    slugTaken: t("slugTaken"),
    slugFormat: t("slugFormat"),
    sunday: t("sunday"),
    weekTaken: t("weekTaken"),
    announcementEmpty: t("announcementEmpty"),
    endBeforeStart: t("endBeforeStart"),
    phone: t("phone"),
    postalCode: t("postalCode"),
    address: t("address"),
    notFound: t("notFound"),
    general: t("general"),
  };
}

/** Saves the billing details of the church's account. */
export async function saveBillingDetails(
  scope: AuthorizedScope<"site.domain.manage">,
  form: FormData,
): Promise<FormState> {
  const values = formValues(form, BILLING_FIELDS);
  const [m, t] = await Promise.all([errorMessages(), getT("admin.billing.errors")]);
  const tax = (values["taxNumber"] ?? "").trim();
  const checked = validate(
    BillingAccountInputSchema,
    {
      name: values["name"]?.trim(),
      taxNumber: tax === "" ? null : tax,
      address: {
        postalCode: values["postalCode"]?.trim(),
        city: values["city"]?.trim(),
        line1: values["line1"]?.trim(),
      },
      email: values["email"]?.trim(),
      paymentMethod: values["paymentMethod"],
    },
    BILLING_FIELDS,
    m,
  );
  if (!checked.ok) {
    const errors = { ...checked.errors };
    if (errors["taxNumber"] !== undefined) errors["taxNumber"] = t("taxNumber");
    return { status: "invalid", errors, values };
  }
  const repos = await getRequestRepositories();
  await repos.billing.upsertBillingAccount(scope.ctx, checked.data);
  redirect("/admin/szamlazas?mentve=1");
}

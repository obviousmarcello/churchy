/** Turns a `ChurchSpec` into contract entities. */
import { emptyDataset, type MockDataset } from "../dataset";
import { addDays } from "@churchy/hu";
import type { Clock } from "./clock";
import type { Build } from "./context";
import {
  buildAnnouncements,
  buildCalendarsAndEvents,
  buildForms,
  buildLocations,
  buildMedia,
  buildNews,
  buildPages,
  buildSchedule,
  buildTenant,
} from "./build-site";
import { buildPeople } from "./build-people";
import { buildBookings, buildPlans, buildRooms, buildSongs } from "./build-workspace";
import { buildHr } from "./build-hr";
import type { ChurchSpec } from "./types";

export function buildChurch(
  spec: ChurchSpec,
  c: Clock,
  emails: Set<string>,
): { ds: MockDataset; personas: Record<string, string> } {
  const b: Build = {
    spec,
    c,
    k: spec.key,
    tid: spec.tenant.id,
    ds: emptyDataset(),
    emails,
    personId: new Map(),
    userId: new Map(),
    personaUser: new Map(),
    personaPerson: new Map(),
    teamId: new Map(),
    positionId: new Map(),
    locationId: new Map(),
    roomId: new Map(),
    ruleId: new Map(),
    calendarId: new Map(),
    hrCategoryId: new Map(),
    formId: new Map(),
    imageIds: [],
    serviceByRuleDate: new Map(),
    occEnd: new Map(),
    songId: [],
    arrangementIds: [],
    templateId: [],
  };

  // Order matters: people first (persona users are referenced everywhere), media before content.
  buildPeople(b);
  buildMedia(b);
  buildTenant(b);
  buildLocations(b);
  buildSchedule(b);
  buildAnnouncements(b);
  buildNews(b);
  buildCalendarsAndEvents(b);
  buildPages(b);
  buildForms(b);
  buildRooms(b);
  buildSongs(b);
  buildPlans(b);
  buildBookings(b);
  buildHr(b);
  buildOwnBilling(b);
  return { ds: b.ds, personas: Object.fromEntries(b.personaUser) };
}

/** Churches that pay for themselves (no diocesan deal) get their own billing account. */
function buildOwnBilling(b: Build): void {
  const { spec, c, ds, tid, k } = b;
  const t = spec.tenant;
  if (t.organizationId) return;
  const accountId = `ba-${k}`;
  ds.billingAccounts.push({
    id: accountId,
    ownerType: "tenant",
    ownerId: tid,
    name: t.billing.name,
    taxNumber: t.billing.taxNumber,
    address: t.billing.address,
    email: t.contact.email,
    paymentMethod: t.billing.payment,
  });
  const yearly = t.billing.period === "yearly";
  const periodEnd = c.at(addDays(c.today, yearly ? 200 : 17), "00:00");
  ds.subscriptions.push({
    id: `sub-${k}-teljes`,
    billingAccountId: accountId,
    planKey: "teljes",
    tenantId: tid,
    quantity: 1,
    period: t.billing.period,
    status: t.billing.status,
    currentPeriodEnd: periodEnd,
    dealId: null,
  });
  const wsKey =
    t.wsTier === "s50"
      ? "ws_s50"
      : t.wsTier === "m150"
        ? "ws_m150"
        : t.wsTier === "l300"
          ? "ws_l300"
          : null;
  if (wsKey) {
    ds.subscriptions.push({
      id: `sub-${k}-ws`,
      billingAccountId: accountId,
      planKey: wsKey,
      tenantId: tid,
      quantity: 1,
      period: t.billing.period,
      status: t.billing.status,
      currentPeriodEnd: periodEnd,
      dealId: null,
    });
  }
  const amount = yearly ? 49_900 : 4_990;
  ds.invoices.push(
    {
      id: `inv-${k}-1`,
      billingAccountId: accountId,
      providerInvoiceId: `PE-${k}-0001`,
      number: `CH-${c.today.slice(0, 4)}-${t.billing.status === "trialing" ? "0007" : "0003"}`,
      amount,
      currency: "HUF",
      status: "paid",
      issuedAt: c.ago(yearly ? 165 : 44, "08:00"),
      paidAt: c.ago(yearly ? 160 : 40, "10:00"),
      pdfUrl: null,
    },
    {
      id: `inv-${k}-2`,
      billingAccountId: accountId,
      providerInvoiceId: null,
      number: `CH-${c.today.slice(0, 4)}-${t.billing.status === "trialing" ? "0021" : "0014"}`,
      amount: wsKey ? amount + 9_900 : amount,
      currency: "HUF",
      status: t.billing.status === "past_due" ? "issued" : "proforma",
      issuedAt: c.ago(6, "08:00"),
      paidAt: null,
      pdfUrl: null,
    },
  );
}

import Link from "next/link";
import { Alert, Badge, ButtonLink, FormattedDate, FormattedTime } from "@churchy/ui";
import { formatDateLong } from "@churchy/hu";
import { AdminPage } from "@/components/admin";
import { DataTable } from "@/components/admin/data-table";
import { getT } from "@/i18n/server";
import { ONBOARDING_STEPS, type DashboardWarning } from "@/lib/admin/warnings";
import { getAdminSections } from "@/server/admin";
import { loadDashboard, type DraftRow, type UpcomingEvent } from "@/server/admin-dashboard";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.dashboard"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** Each quick action opens its flow in one click (D-18 AC2); shown when the section is open. */
const QUICK_ACTIONS = [
  { section: "announcements", href: "/admin/hirdetesek/uj", label: "weeklyAnnouncement" },
  { section: "schedule", href: "/admin/rend/kivetel", label: "scheduleChange" },
  { section: "news", href: "/admin/hirek/uj", label: "newNews" },
  { section: "events", href: "/admin/esemenyek/uj", label: "newEvent" },
] as const;

const WARNING_ACTION: Record<DashboardWarning["kind"], string> = {
  announcement: "/admin/hirdetesek/uj",
  holidays: "/admin/rend/kivetel",
  onboarding: "/admin/megjelenes",
  requests: "/admin/kerelmek",
};

/** *Vezérlőpult* — drafts, upcoming events, quick actions, warnings and new requests. */
export default async function AdminDashboardPage() {
  const [t, data, sections] = await Promise.all([
    getT("admin.dashboard"),
    loadDashboard(),
    getAdminSections(),
  ]);
  const quick = QUICK_ACTIONS.filter((a) => data.sectionIds.has(a.section));
  const showDrafts = ["news", "announcements", "events", "pages"].some((s) =>
    data.sectionIds.has(s),
  );

  return (
    <AdminPage title={t("title")} lead={t("lead")} testId="admin-dashboard">
      <section aria-labelledby="dash-warnings" data-testid="dashboard-warnings">
        <h2 id="dash-warnings" className="font-heading text-fs-5 font-bold">
          {t("warnings.heading")}
        </h2>
        {data.warnings.length === 0 ? (
          <p className="mt-3 text-muted">{t("warnings.none")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {data.warnings.map((w) => (
              <li key={w.kind} data-warning={w.kind}>
                <Alert
                  tone="warning"
                  title={t(`warnings.${w.kind}.title`)}
                  action={
                    <ButtonLink href={WARNING_ACTION[w.kind]} variant="secondary" size="sm">
                      {t(`warnings.${w.kind}.action`)}
                    </ButtonLink>
                  }
                >
                  <WarningBody warning={w} />
                </Alert>
              </li>
            ))}
          </ul>
        )}
      </section>

      {quick.length > 0 ? (
        <section aria-labelledby="dash-quick" data-testid="quick-actions">
          <h2 id="dash-quick" className="font-heading text-fs-5 font-bold">
            {t("quick.heading")}
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quick.map((a) => (
              <li key={a.section}>
                <ButtonLink href={a.href} variant="secondary" size="lg" fullWidth>
                  {t(`quick.${a.label}`)}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {data.newRequests !== null ? (
          <section aria-labelledby="dash-requests" data-testid="dashboard-requests">
            <h2 id="dash-requests" className="font-heading text-fs-5 font-bold">
              {t("requests.heading")}
            </h2>
            <p className="mt-3 text-fs-4 font-semibold" data-count={data.newRequests}>
              {data.newRequests === 0
                ? t("requests.none")
                : t("requests.count", { count: data.newRequests })}
            </p>
            <p className="mt-3">
              <ButtonLink href="/admin/kerelmek" variant="secondary" size="sm">
                {t("requests.open")}
              </ButtonLink>
            </p>
          </section>
        ) : null}

        {data.sectionIds.has("events") ? (
          <section aria-labelledby="dash-upcoming" data-testid="dashboard-upcoming">
            <h2 id="dash-upcoming" className="font-heading text-fs-5 font-bold">
              {t("upcoming.heading")}
            </h2>
            <div className="mt-3">
              <DataTable<UpcomingEvent>
                caption={t("upcoming.caption")}
                captionHidden
                rows={data.upcoming}
                rowKey={(e) => e.id}
                empty={t("upcoming.empty")}
                columns={[
                  {
                    key: "title",
                    header: t("drafts.title"),
                    rowHeader: true,
                    cell: (e) => (
                      <Link href="/admin/esemenyek" className="font-semibold text-primary">
                        {e.title}
                      </Link>
                    ),
                  },
                  {
                    key: "when",
                    header: t("upcoming.heading"),
                    cell: (e) => (
                      <>
                        <FormattedDate value={e.date} format="monthDay" />
                        {e.start !== null ? (
                          <>
                            {" "}
                            <FormattedTime value={e.start} />
                          </>
                        ) : null}
                      </>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        ) : null}
      </div>

      {showDrafts ? (
        <section aria-labelledby="dash-drafts" data-testid="dashboard-drafts">
          <h2 id="dash-drafts" className="font-heading text-fs-5 font-bold">
            {t("drafts.heading")}
          </h2>
          <div className="mt-3">
            <DataTable<DraftRow>
              caption={t("drafts.caption")}
              captionHidden
              rows={data.drafts}
              rowKey={(d) => `${d.type}-${d.id}`}
              empty={t("drafts.empty")}
              columns={[
                {
                  key: "title",
                  header: t("drafts.title"),
                  rowHeader: true,
                  cell: (d) => (
                    <Link
                      href={sections.find((s) => s.id === d.section)?.href ?? "/admin"}
                      className="inline-flex min-h-11 items-center font-semibold text-primary"
                    >
                      {d.title ?? (
                        <>
                          {t("drafts.announcementOf")}
                          {" "}
                          <FormattedDate value={d.date ?? data.today} format="monthDay" />
                        </>
                      )}
                    </Link>
                  ),
                },
                {
                  key: "type",
                  header: t("drafts.type"),
                  cell: (d) => <Badge>{t(`drafts.types.${d.type}`)}</Badge>,
                },
                {
                  key: "changed",
                  header: t("drafts.changed"),
                  cell: (d) => <FormattedDate value={d.updatedAt} format="short" />,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="dash-sections">
        <h2 id="dash-sections" className="font-heading text-fs-5 font-bold">
          {t("sections")}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="area-sections">
          {sections.map((section) => (
            <li key={section.id} data-section={section.id}>
              <Link
                href={section.href}
                className="flex min-h-11 items-center rounded-md border-2 border-border-strong bg-surface-raised px-4 py-3 font-semibold text-primary"
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AdminPage>
  );
}

async function WarningBody({ warning }: { warning: DashboardWarning }) {
  const t = await getT("admin.dashboard");
  switch (warning.kind) {
    case "announcement":
      return <p>{t("warnings.announcement.body", { date: formatDateLong(warning.sunday) })}</p>;
    case "requests":
      return <p>{t("warnings.requests.body", { count: warning.count })}</p>;
    case "holidays":
      return (
        <>
          <p>{t("warnings.holidays.body")}</p>
          <ul className="mt-2 list-disc pl-6">
            {warning.days.map((d) => (
              <li key={d.date}>
                <FormattedDate value={d.date} format="monthDayLong" /> – {d.name}
              </li>
            ))}
          </ul>
        </>
      );
    case "onboarding":
      return (
        <>
          <p>{t("warnings.onboarding.body")}</p>
          <ul className="mt-2 list-disc pl-6">
            {ONBOARDING_STEPS.filter((s) => warning.missing.includes(s)).map((s) => (
              <li key={s}>{t(`warnings.onboarding.steps.${s}`)}</li>
            ))}
          </ul>
        </>
      );
  }
}

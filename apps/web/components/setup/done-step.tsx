"use client";

import Link from "next/link";
import { Alert, Badge, ButtonLink } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { buildChecklist, checklistProgress, type SetupOutcome } from "@/lib/setup/checklist";
import { flaggedKeys, includedStaff } from "@/lib/setup/draft";

/** Step 5: what the wizard did, and the checklist that continues in the admin. */
export function DoneStep({
  outcome,
  siteHref,
}: {
  outcome: SetupOutcome;
  /** A finished example site to look at (the demo has no real host for the new church yet). */
  siteHref?: string;
}) {
  const t = useT("admin.setup.done");
  const items = buildChecklist(outcome);
  const { done, total } = checklistProgress(items);
  const { draft, invites, settings } = outcome;
  const flagged = flaggedKeys(draft).length;
  return (
    <div className="grid gap-6" data-testid="setup-done">
      <Alert
        tone="success"
        title={t("title", { name: draft.shortName || draft.name })}
        role="status"
      >
        <p>{t("lead")}</p>
      </Alert>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="done-summary">
        <Stat label={t("stats.services")} value={draft.serviceTimes.length} />
        <Stat label={t("stats.locations")} value={draft.locations.length} />
        <Stat label={t("stats.people")} value={includedStaff(draft).length} />
        <Stat label={t("stats.invites")} value={invites.length} />
      </dl>

      {settings.comingSoon ? <Alert tone="info">{t("comingSoon")}</Alert> : null}
      {flagged > 0 ? (
        <Alert tone="warning">
          <p>{t("stillFlagged", { count: flagged })}</p>
        </Alert>
      ) : null}

      <section aria-labelledby="checklist-heading" className="grid gap-3">
        <h2 id="checklist-heading" className="font-heading text-fs-5 font-semibold">
          {t("checklist.title")}
        </h2>
        <p data-testid="checklist-progress" className="text-muted">
          {t("checklist.progress", { done, total })}
        </p>
        <progress
          className="h-3 w-full max-w-md accent-primary"
          max={total}
          value={done}
          aria-label={t("checklist.bar")}
        />
        <ol className="grid gap-2" data-testid="checklist">
          {items.map((item) => (
            <li
              key={item.id}
              data-item={item.id}
              data-done={item.done}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3"
            >
              <span>
                <span className="font-semibold">{t(`checklist.items.${item.id}.title`)}</span>
                <span className="block text-fs-2 text-muted">
                  {t(`checklist.items.${item.id}.help`)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={item.done ? "success" : "neutral"}>
                  {item.done ? t("checklist.done") : t("checklist.todo")}
                </Badge>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline"
                >
                  {t("checklist.open")}
                  <span className="sr-only"> – {t(`checklist.items.${item.id}.title`)}</span>
                </Link>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="flex flex-wrap gap-3">
        <ButtonLink href="/admin" size="lg" data-testid="open-admin">
          {t("openAdmin")}
        </ButtonLink>
        {siteHref ? (
          <ButtonLink href={siteHref} size="lg" variant="outline" data-testid="view-site">
            {t("viewSite")}
          </ButtonLink>
        ) : null}
      </p>
      {siteHref ? <p className="text-fs-2 text-muted">{t("viewSiteHint")}</p> : null}
      <p className="text-fs-2 text-muted">{t("demoNote")}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-raised p-4">
      <dt className="text-fs-2 text-muted">{label}</dt>
      <dd className="font-heading text-fs-6 font-bold text-primary">{value}</dd>
    </div>
  );
}

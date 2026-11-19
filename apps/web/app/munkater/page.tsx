import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Badge, ButtonLink, FormattedDate, FormattedTime } from "@churchy/ui";
import { AssignmentButtons } from "@/components/workspace/assignment-buttons";
import { EntryItem } from "@/components/workspace/entry-item";
import { getEntryLabels } from "@/components/workspace/entry-labels";
import { getT } from "@/i18n/server";
import { creatableVisibilities } from "@/lib/workspace/event-access";
import { getMemberEnv } from "@/server/workspace";
import { getWorkspaceSections } from "@/server/workspace-nav";
import { loadToday } from "@/server/workspace-today";
import { respondToAssignment } from "@/server/workspace-actions";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.home"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

function Block({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      data-testid={`today-${id}`}
      className="rounded-md border border-border bg-surface-raised p-4"
    >
      <h2 id={`${id}-heading`} className="flex items-center gap-2 font-heading text-fs-5 font-bold">
        {title}
        {count !== undefined ? <Badge tone="primary">{count}</Badge> : null}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function greetingKey(now: Date): "morning" | "day" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("hu-HU", {
      timeZone: "Europe/Budapest",
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour < 10 ? "morning" : hour < 18 ? "day" : "evening";
}

/**
 * *Ma* (D-53, SDD §20.3): what needs my answer, what is on today and this week, and my open
 * requests. Each block appears only when it has something to show; the quick actions below are
 * the workspace sections the actor may use.
 */
export default async function WorkspaceTodayPage() {
  const [env, t, labels, sections] = await Promise.all([
    getMemberEnv(),
    getT("munkater.home"),
    getEntryLabels(),
    getWorkspaceSections(),
  ]);
  const data = await loadToday(env);
  const ids = new Set(sections.map((s) => s.id));
  const canCreate = creatableVisibilities(env.actor, env.tenantId, null).length > 0;
  const greeting = t(`greeting.${greetingKey(env.now)}`);

  return (
    <div className="flex max-w-3xl flex-col gap-4" data-testid="workspace-today">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {data.givenName === null
            ? greeting
            : t("greetingName", { greeting, name: data.givenName })}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">
          <FormattedDate value={env.today} format="long" />
        </p>
      </header>

      {data.tier ? (
        <Alert
          tone={data.tier.level === "full" ? "danger" : "warning"}
          title={t(`tier.${data.tier.level === "full" ? "fullTitle" : "warningTitle"}`)}
        >
          <p>{t("tier.body", { used: data.tier.used, cap: data.tier.cap })}</p>
        </Alert>
      ) : null}

      {data.approvals.length > 0 ? (
        <Block id="approvals" title={t("approvals.title")} count={data.approvals.length}>
          <ul className="flex flex-col divide-y divide-border">
            {data.approvals.map((a) => (
              <li
                key={`${a.kind}-${a.id}`}
                className="flex min-h-11 flex-wrap items-center gap-2 py-2"
              >
                {a.kind === "booking" ? (
                  <>
                    <span className="font-semibold">{a.title}</span>
                    <span className="text-muted">
                      {a.room} · <FormattedDate value={a.startsAt} format="short" />{" "}
                      <FormattedTime value={a.startsAt} />
                    </span>
                    <ButtonLink
                      href="/munkater/foglalas"
                      size="sm"
                      variant="secondary"
                      className="ml-auto"
                    >
                      {t("approvals.open")}
                    </ButtonLink>
                  </>
                ) : a.kind === "plan" ? (
                  <>
                    <span className="font-semibold">{a.title}</span>
                    <Badge tone="warning">{labels.planStatus.in_review}</Badge>
                    <ButtonLink
                      href="/munkater/liturgia"
                      size="sm"
                      variant="secondary"
                      className="ml-auto"
                    >
                      {t("approvals.open")}
                    </ButtonLink>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{a.reference}</span>
                    <span className="text-muted">{t("approvals.hr")}</span>
                    <ButtonLink
                      href="/munkater/hr"
                      size="sm"
                      variant="secondary"
                      className="ml-auto"
                    >
                      {t("approvals.open")}
                    </ButtonLink>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {data.todos.length > 0 ? (
        <Block id="todos" title={t("todos.title")} count={data.todos.length}>
          <ul className="flex flex-col divide-y divide-border">
            {data.todos.map((todo) => (
              <li key={todo.id} className="flex flex-col gap-2 py-3" data-testid="todo-assignment">
                <span className="font-semibold">
                  <FormattedDate value={todo.startsAt} format="relative" now={env.now} />{" "}
                  <FormattedTime value={todo.startsAt} /> – {todo.position}
                </span>
                <span className="text-muted">{todo.team}</span>
                <AssignmentButtons id={todo.id} respond={respondToAssignment} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {data.today.length > 0 ? (
        <Block id="today" title={t("today.title")}>
          <ul className="flex flex-col">
            {data.today.map((entry) => (
              <EntryItem key={entry.key} entry={entry} labels={labels} />
            ))}
          </ul>
        </Block>
      ) : null}

      {data.week.some((d) => d.entries.length > 0) ? (
        <Block id="week" title={t("week.title")}>
          <div className="flex flex-col gap-3">
            {data.week
              .filter((d) => d.entries.length > 0)
              .map((d) => (
                <div key={d.date}>
                  <h3 className="font-semibold text-primary">
                    <FormattedDate value={d.date} format="relative" now={env.now} />
                  </h3>
                  <ul>
                    {d.entries.map((entry) => (
                      <EntryItem key={entry.key} entry={entry} labels={labels} />
                    ))}
                  </ul>
                </div>
              ))}
          </div>
          <Link
            href="/munkater/naptar"
            className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary"
          >
            {t("week.all")}
          </Link>
        </Block>
      ) : null}

      {data.requests.length > 0 ? (
        <Block id="requests" title={t("requests.title")} count={data.requests.length}>
          <ul className="flex flex-col divide-y divide-border">
            {data.requests.map((r) => (
              <li
                key={`${r.kind}-${r.id}`}
                className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 py-2"
              >
                <span className="font-semibold">{r.label}</span>
                {r.detail ? <span className="text-muted">{r.detail}</span> : null}
                <Badge tone="info">
                  {r.kind === "hr"
                    ? t(`requests.hrStatus.${r.status as "uj"}`)
                    : labels.bookingStatus[r.status as "pending"]}
                </Badge>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <nav
        aria-label={t("quick.title")}
        className="flex flex-wrap gap-2"
        data-testid="quick-actions"
      >
        {ids.has("rooms") ? (
          <ButtonLink href="/munkater/foglalas" variant="secondary">
            {t("quick.room")}
          </ButtonLink>
        ) : null}
        {ids.has("hr") ? (
          <ButtonLink href="/munkater/hr" variant="secondary">
            {t("quick.request")}
          </ButtonLink>
        ) : null}
        {ids.has("calendar") && canCreate ? (
          <ButtonLink href="/munkater/naptar/uj" variant="secondary">
            {t("quick.event")}
          </ButtonLink>
        ) : null}
      </nav>
    </div>
  );
}

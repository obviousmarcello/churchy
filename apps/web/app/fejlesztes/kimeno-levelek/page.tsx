import { headers } from "next/headers";
import { EMAIL_TEMPLATES, renderPush } from "@churchy/email";
import {
  AdminScope,
  Alert,
  Badge,
  Button,
  ButtonLink,
  FormattedDate,
  FormattedTime,
  PageShell,
  Select,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import {
  OUTBOX_CHANNELS,
  baseUrlFrom,
  distinctRecipients,
  filterOutbox,
  isPersonaKey,
  parseChannel,
} from "@/lib/outbox-view";
import { listOutbox, type OutboxMessage, type OutboxRecipientView } from "@/server/data-adapters";
import { emailContextFor } from "@/server/email-context";
import { clearDemoOutbox, submitSampleRequest } from "./actions";
import { LiveRefresh } from "./live-refresh";
import { OutboxDetail } from "./outbox-detail";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("dev.outbox"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

// The outbox changes with every mock action and HIDE_DEV_ROUTES is read at runtime.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const BASE_PATH = "/fejlesztes/kimeno-levelek";

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  assertDevRoutesVisible();

  const params = await searchParams;
  const channel = parseChannel(first(params.csatorna));
  const recipient = first(params.cimzett) || undefined;
  const selectedId = first(params.uzenet);

  const [t, common] = await Promise.all([getT("dev.outbox"), getT("common")]);
  const baseUrl = baseUrlFrom(await headers());

  // Newest first.
  const all = listOutbox().reverse();
  const visible = filterOutbox(all, { channel, recipient });
  const selected = selectedId === undefined ? undefined : all.find((m) => m.id === selectedId);

  const recipientText = (r: OutboxRecipientView): string => {
    if (r.kind === "persona")
      return isPersonaKey(r.persona) ? t(`personas.${r.persona}`) : r.persona;
    if (r.name !== null) return r.name;
    return r.kind === "person"
      ? t("recipientPerson", { id: r.id })
      : t("recipientUser", { id: r.id });
  };
  const channelText = (c: OutboxMessage["channel"]) =>
    c === "email" ? t("channelEmail") : t("channelPush");
  const subjectOf = (m: OutboxMessage): string => {
    const ctx = emailContextFor(m, baseUrl);
    try {
      return m.channel === "email"
        ? EMAIL_TEMPLATES[m.template].subject(m.params, ctx)
        : renderPush(m.template, m.params, ctx).title;
    } catch {
      return t(`templates.${m.template}`);
    }
  };

  const query = (extra: Record<string, string>) => {
    const search = new URLSearchParams();
    if (channel) search.set("csatorna", channel);
    if (recipient) search.set("cimzett", recipient);
    for (const [key, value] of Object.entries(extra)) search.set(key, value);
    const text = search.toString();
    return text ? `${BASE_PATH}?${text}` : BASE_PATH;
  };

  const last = all.at(-1);
  const revision = `${all.length}:${last?.id ?? ""}`;

  return (
    <AdminScope>
      <PageShell skipLinkLabel={common("skipToContent")}>
        <div className="mx-auto w-full max-w-(--content-max) px-(--gutter) py-10">
          <header>
            <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
              {t("title")}
            </h1>
            <p className="mt-4 max-w-[68ch] text-fs-4">{t("lead")}</p>
            <Alert tone="info" className="mt-6">
              {t("devNotice")}
            </Alert>
            <p className="mt-4 text-fs-2 text-muted">{t("live")}</p>
          </header>

          <section aria-label={t("actionsLabel")} className="mt-8 flex flex-wrap items-start gap-6">
            <form action={submitSampleRequest} className="grid max-w-md gap-2">
              <Button type="submit" data-testid="outbox-sample">
                {t("sample")}
              </Button>
              <p className="text-fs-2 text-muted">{t("sampleHelp")}</p>
            </form>
            <form action={clearDemoOutbox} className="grid max-w-md gap-2">
              <Button type="submit" variant="danger" data-testid="outbox-clear">
                {t("clear")}
              </Button>
              <p className="text-fs-2 text-muted">{t("clearHelp")}</p>
            </form>
          </section>

          <section aria-label={t("filtersLabel")} className="mt-8">
            <form method="get" className="flex flex-wrap items-end gap-4">
              <Select
                label={t("filterChannel")}
                name="csatorna"
                defaultValue={channel ?? ""}
                wrapperClassName="min-w-48"
                options={[
                  { value: "", label: t("filterAll") },
                  ...OUTBOX_CHANNELS.map((c) => ({ value: c, label: channelText(c) })),
                ]}
              />
              <Select
                label={t("filterRecipient")}
                name="cimzett"
                defaultValue={recipient ?? ""}
                wrapperClassName="min-w-64"
                options={[
                  { value: "", label: t("filterAll") },
                  ...distinctRecipients(all).map((d) => ({
                    value: d.key,
                    label: recipientText(d.recipient),
                  })),
                ]}
              />
              <Button type="submit" variant="secondary">
                {t("apply")}
              </Button>
              <ButtonLink href={BASE_PATH} variant="ghost">
                {t("resetFilters")}
              </ButtonLink>
            </form>
          </section>

          <div className="mt-10 grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <section aria-labelledby="outbox-list-heading" className="min-w-0">
              <h2 id="outbox-list-heading" className="font-heading text-fs-5 font-bold">
                {t("listHeading")}
              </h2>
              <p role="status" data-testid="outbox-count" className="mt-1 text-fs-2 text-muted">
                {t("count", { count: visible.length })}
              </p>
              {visible.length === 0 ? (
                <Alert tone="info" className="mt-4">
                  {all.length === 0 ? t("empty") : t("emptyFiltered")}
                </Alert>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table aria-label={t("listLabel")} className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b-2 border-border-strong text-fs-2">
                        <th scope="col" className="py-2 pr-4">
                          {t("columnTime")}
                        </th>
                        <th scope="col" className="py-2 pr-4">
                          {t("columnChannel")}
                        </th>
                        <th scope="col" className="py-2 pr-4">
                          {t("columnRecipient")}
                        </th>
                        <th scope="col" className="py-2">
                          {t("columnSubject")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((m) => (
                        <tr
                          key={m.id}
                          data-testid="outbox-row"
                          data-template={m.template}
                          aria-current={m.id === selected?.id ? "true" : undefined}
                          className="border-b border-border align-top aria-[current=true]:bg-primary-soft"
                        >
                          <td className="py-3 pr-4 text-fs-2 whitespace-nowrap">
                            <FormattedDate value={m.at} format="short" />{" "}
                            <FormattedTime value={m.at} />
                          </td>
                          <td className="py-3 pr-4">
                            <Badge tone={m.channel === "email" ? "info" : "neutral"}>
                              {channelText(m.channel)}
                            </Badge>
                          </td>
                          <td className="py-3 pr-4 text-fs-2">{recipientText(m.recipient)}</td>
                          <td className="py-3">
                            <a
                              href={query({ uzenet: m.id })}
                              className="font-semibold text-primary underline underline-offset-2"
                            >
                              {subjectOf(m)}
                              <span className="sr-only"> {t("open")}</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {selected ? (
              <OutboxDetail
                message={selected}
                baseUrl={baseUrl}
                channelLabel={channelText(selected.channel)}
                recipientLabel={recipientText(selected.recipient)}
                templateLabel={t(`templates.${selected.template}`)}
                labels={{
                  heading: t("detailHeading"),
                  time: t("fieldTime"),
                  channel: t("fieldChannel"),
                  recipient: t("fieldRecipient"),
                  church: t("fieldChurch"),
                  template: t("fieldTemplate"),
                  subject: t("fieldSubject"),
                  link: t("fieldLink"),
                  noLink: t("noLink"),
                  noChurch: t("noChurch"),
                  emailPreview: t("emailPreview"),
                  emailFrameTitle: t("emailFrameTitle"),
                  plainTextHeading: t("plainTextHeading"),
                  pushPreview: t("pushPreview"),
                  pushTitle: t("fieldPushTitle"),
                  pushBody: t("fieldPushBody"),
                  renderFailed: t("renderFailed"),
                }}
              />
            ) : (
              <Alert tone="info">
                {selectedId === undefined ? t("detailNone") : t("detailGone")}
              </Alert>
            )}
          </div>
        </div>
        <LiveRefresh revision={revision} />
      </PageShell>
    </AdminScope>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { formatMonthDay, formatTime, weekdayName } from "@churchy/hu";
import { resolveDays, type DayContext, type DayContextFn } from "@churchy/schedule";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormattedDate,
  DateInput,
  Input,
  Select,
  TimeInput,
} from "@churchy/ui";
import { deleteException, saveExceptions } from "@/app/admin/rend/actions";
import { WeekDays } from "@/components/schedule/week-days";
import type { ScheduleEditorProps } from "@/components/schedule/schedule-editor";
import { useT } from "@/i18n/client";
import {
  exceptionInputs,
  exceptionProblem,
  holidayExceptions,
  holidayTemplates,
  isRuleService,
  servicesOn,
  withExceptions,
  type ExceptionAction,
  type ExceptionDraft,
  type HolidayTemplateKey,
} from "@/lib/admin/schedule-editor";
import { languageName, scheduleInput, serviceTypeLabel } from "@/lib/service-schedule/view";

type Feedback = { tone: "success" | "danger"; text: string } | null;

const ACTIONS: readonly ExceptionAction[] = ["cancel", "modify", "add"];

/**
 * The exception flow (D-22 AC3): pick a date, choose the affected services from the engine's
 * output, cancel / change / add, give a reason, see the result as visitors will, save. Below it
 * the holiday templates (FR-312) and the upcoming exceptions with a way to remove them.
 */
export function ExceptionFlow(props: ScheduleEditorProps) {
  const { locations, data, serviceTypes, today, now, dayContexts } = props;
  const t = useT("admin.schedule.exceptions");
  const pub = useT("public.schedule");
  const router = useRouter();
  const [pending, start] = useTransition();

  const [date, setDate] = useState(today);
  const [action, setAction] = useState<ExceptionAction>("cancel");
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [time, setTime] = useState("10:00");
  const [serviceType, setServiceType] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [touched, setTouched] = useState(false);

  const source = useMemo(() => ({ locations, data }), [locations, data]);
  const dayContext: DayContextFn = (d) => dayContexts[d] ?? ({} as DayContext);
  const services = useMemo(
    () => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? servicesOn(source, date) : []),
    [source, date],
  );
  const selected = services.filter((s) => selectedIds.has(s.id));
  const holidayName = dayContexts[date]?.publicHolidayName ?? dayContexts[date]?.liturgicalDayName;

  const draft: ExceptionDraft = {
    action,
    date,
    selected,
    reason,
    note,
    time,
    serviceType:
      action === "add" && serviceType === "" ? (serviceTypes[0]?.key ?? "") : serviceType,
    locationId,
  };
  const problem = exceptionProblem(draft);
  const inputs = problem === null || problem === "reason" ? exceptionInputs(draft) : [];
  const result = useMemo(() => {
    if (inputs.length === 0) return [];
    return resolveDays(
      scheduleInput({ locations, data: withExceptions(data, inputs) }),
      date,
      date,
      { includeCancelled: true, dayContext },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.length,
    locations,
    data,
    date,
    action,
    time,
    serviceType,
    reason,
    note,
    locationId,
    selectedIds,
  ]);

  const labels = {
    today: pub("today"),
    noServices: pub("noServices"),
    badge: (status: "cancelled" | "modified" | "added") => pub(`badges.${status}`),
    language: (code: string) => pub("language", { language: languageName(code) }),
    originalTime: (value: string) => pub("originalTime", { time: value }),
  };

  function pickDate(next: string) {
    setDate(next);
    setSelectedIds(new Set());
    setFeedback(null);
    setTouched(false);
    const ctx = dayContexts[next];
    setReason(ctx?.publicHolidayName ?? ctx?.liturgicalDayName ?? "");
  }

  function toggle(id: string, checked: boolean, time0?: string, type0?: string) {
    setSelectedIds((all) => {
      const next = new Set(all);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (checked && action === "modify" && selectedIds.size === 0) {
      if (time0) setTime(time0);
      if (type0) setServiceType(type0);
    }
  }

  function submit() {
    setTouched(true);
    if (problem !== null) return;
    setFeedback(null);
    start(async () => {
      const res = await saveExceptions(exceptionInputs(draft));
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (!res.value.ok) setFeedback({ tone: "danger", text: t("invalid") });
      else {
        setFeedback({ tone: "success", text: t("saved") });
        setSelectedIds(new Set());
        setReason("");
        setNote("");
        setTouched(false);
        router.refresh();
      }
    });
  }

  const upcoming = data.exceptions
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const typeOptions = serviceTypes.map((s) => ({ value: s.key, label: s.forms.nom }));
  const problemText = problem === null ? undefined : t(`problems.${problem}`);

  return (
    <div className="grid gap-10" data-testid="exception-flow">
      <form
        className="grid max-w-3xl gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <section aria-labelledby="step-date" className="grid gap-3">
          <h2 id="step-date" className="font-heading text-fs-5 font-semibold">
            {t("stepDate")}
          </h2>
          <DateInput
            label={t("date")}

            value={date}
            onChange={(e) => pickDate(e.target.value)}
            wrapperClassName="max-w-xs"
            help={holidayName ? t("dateHoliday", { name: holidayName }) : undefined}
          />
        </section>

        <section aria-labelledby="step-action" className="grid gap-3">
          <h2 id="step-action" className="font-heading text-fs-5 font-semibold">
            {t("stepAction")}
          </h2>
          <fieldset className="grid gap-2" data-testid="exception-action">
            <legend className="sr-only">{t("stepAction")}</legend>
            {ACTIONS.map((a) => (
              <label
                key={a}
                className="flex min-h-11 items-center gap-3 rounded-md border-2 border-border px-4 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
              >
                <input
                  type="radio"
                  name="action"
                  value={a}
                  checked={action === a}
                  onChange={() => {
                    setAction(a);
                    setSelectedIds(new Set());
                  }}
                  className="size-5 accent-(--color-primary)"
                />
                <span>
                  <span className="font-semibold">{t(`actions.${a}`)}</span>
                  <span className="block text-fs-2 text-muted">{t(`actionHelp.${a}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        {action !== "add" ? (
          <section aria-labelledby="step-services" className="grid gap-3">
            <h2 id="step-services" className="font-heading text-fs-5 font-semibold">
              {t("stepServices")}
            </h2>
            {services.length === 0 ? (
              <Alert tone="info">
                <p>{t("noServicesOnDate")}</p>
              </Alert>
            ) : (
              <ul className="grid gap-2" data-testid="exception-services">
                {services.map((s) => {
                  const place =
                    locations.length > 1
                      ? locations.find((l) => l.id === s.locationId)?.name
                      : undefined;
                  const label = `${formatTime(s.time)} · ${serviceTypeLabel(s.serviceType, serviceTypes)}${place ? ` · ${place}` : ""}`;
                  return (
                    <li key={s.id}>
                      <Checkbox
                        label={isRuleService(s) ? label : `${label} (${t("addedAlready")})`}
                        checked={selectedIds.has(s.id)}
                        disabled={!isRuleService(s)}
                        onChange={(e) => toggle(s.id, e.target.checked, s.time, s.serviceType)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        <section aria-labelledby="step-details" className="grid gap-4">
          <h2 id="step-details" className="font-heading text-fs-5 font-semibold">
            {t("stepDetails")}
          </h2>
          {action === "add" ? (
            <Select
              label={t("location")}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
            />
          ) : null}
          {action !== "cancel" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TimeInput
                label={action === "modify" ? t("newTime") : t("time")}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <Select
                label={t("type")}
                value={draft.serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                options={typeOptions}
                placeholder={action === "modify" ? t("typeUnchanged") : undefined}
              />
            </div>
          ) : null}
          <Input
            label={t("reason")}
            help={t("reasonHelp")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
            error={touched && problem === "reason" ? t("problems.reason") : undefined}
          />
          {action !== "cancel" ? (
            <Input
              label={t("note")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              optionalLabel={t("optional")}
            />
          ) : null}
        </section>

        <section
          aria-labelledby="step-result"
          className="grid gap-3"
          data-testid="exception-result"
        >
          <h2 id="step-result" className="font-heading text-fs-5 font-semibold">
            {t("stepResult")}
          </h2>
          {result.length > 0 ? (
            <WeekDays
              days={result}
              locations={locations}
              showLocation={locations.length > 1}
              serviceTypes={serviceTypes}
              today={today}
              now={now}
              labels={labels}
              isChanged={(s) => s.status !== "regular"}
            />
          ) : (
            <p className="text-muted">{t("resultEmpty")}</p>
          )}
        </section>

        {touched && problemText && problem !== "reason" ? (
          <Alert tone="danger">
            <p>{problemText}</p>
          </Alert>
        ) : null}
        {feedback ? (
          <div data-testid="exception-feedback">
            <Alert tone={feedback.tone}>
              <p>{feedback.text}</p>
            </Alert>
          </div>
        ) : null}
        <div>
          <Button type="submit" disabled={pending} data-testid="exception-save">
            {t("save")}
          </Button>
        </div>
      </form>

      <HolidayTemplates today={today} locationsCount={locations.length} />

      <section aria-labelledby="upcoming-heading" className="grid gap-3">
        <h2 id="upcoming-heading" className="font-heading text-fs-5 font-semibold">
          {t("upcomingTitle")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-muted">{t("upcomingEmpty")}</p>
        ) : (
          <ul className="grid gap-2" data-testid="upcoming-exceptions">
            {upcoming.map((e) => {
              const place = e.locationId
                ? locations.find((l) => l.id === e.locationId)?.name
                : null;
              return (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-raised px-4 py-2"
                >
                  <span className="font-semibold">
                    {weekdayName(e.date, { capitalize: true })},{" "}
                    <FormattedDate value={e.date} format="monthDay" />
                  </span>
                  <Badge
                    tone={e.kind === "cancel" ? "danger" : e.kind === "modify" ? "warning" : "info"}
                  >
                    {pub(
                      `badges.${e.kind === "cancel" ? "cancelled" : e.kind === "modify" ? "modified" : "added"}`,
                    )}
                  </Badge>
                  <span className="text-fs-2 text-muted">
                    {place ?? t("allLocations")}
                    {e.time ? ` · ${formatTime(e.time)}` : ""}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    disabled={pending}
                    aria-label={t("removeAria", { date: e.date })}
                    onClick={() =>
                      start(async () => {
                        await deleteException(e.id);
                        router.refresh();
                      })
                    }
                  >
                    {t("remove")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function HolidayTemplates({ today, locationsCount }: { today: string; locationsCount: number }) {
  const t = useT("admin.schedule.exceptions.templates");
  const router = useRouter();
  const [pending, start] = useTransition();
  const templates = useMemo(() => holidayTemplates(today), [today]);
  const [open, setOpen] = useState<HolidayTemplateKey | null>(null);
  const [dates, setDates] = useState<ReadonlySet<string>>(new Set());
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  function choose(key: HolidayTemplateKey) {
    const template = templates.find((x) => x.key === key);
    setOpen(key);
    setDates(new Set(template?.dates ?? []));
    setReason(t(`names.${key}`));
    setFeedback(null);
  }

  const template = templates.find((x) => x.key === open);

  return (
    <section
      aria-labelledby="templates-heading"
      className="grid max-w-3xl gap-3"
      data-testid="holiday-templates"
    >
      <h2 id="templates-heading" className="font-heading text-fs-5 font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted">{t("help", { count: locationsCount })}</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((x) => (
          <Button
            key={x.key}
            variant={open === x.key ? "primary" : "secondary"}
            onClick={() => choose(x.key)}
            data-testid={`template-${x.key}`}
          >
            {t(`names.${x.key}`)}
          </Button>
        ))}
      </div>
      {template ? (
        <div
          className="grid gap-4 rounded-md border-2 border-border p-4"
          data-testid="template-preview"
        >
          <p className="font-semibold">{t("previewTitle")}</p>
          <ul className="grid gap-1">
            {template.dates.map((d) => (
              <li key={d}>
                <Checkbox
                  label={`${weekdayName(d, { capitalize: true })}, ${formatMonthDay(d)} – ${t("cancelAll")}`}
                  checked={dates.has(d)}
                  onChange={(e) =>
                    setDates((all) => {
                      const next = new Set(all);
                      if (e.target.checked) next.add(d);
                      else next.delete(d);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
          <Input
            label={t("reason")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
          {feedback ? (
            <Alert tone={feedback.tone}>
              <p>{feedback.text}</p>
            </Alert>
          ) : null}
          <div>
            <Button
              disabled={pending || dates.size === 0 || reason.trim() === ""}
              data-testid="template-apply"
              onClick={() =>
                start(async () => {
                  const picked = template.dates.filter((d) => dates.has(d));
                  const res = await saveExceptions(holidayExceptions(picked, reason));
                  if (res.ok && res.value.ok) {
                    setFeedback({ tone: "success", text: t("applied", { count: picked.length }) });
                    router.refresh();
                  } else setFeedback({ tone: "danger", text: t("failed") });
                })
              }
            >
              {t("apply")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

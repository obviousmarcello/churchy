"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Location, ScheduleData, ServiceRule } from "@churchy/contracts";
import { formatTime, weekdayName } from "@churchy/hu";
import {
  isPeriodActive,
  type DayContext,
  type DayContextFn,
  type Service,
} from "@churchy/schedule";
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
  type SelectOption,
} from "@churchy/ui";
import { deletePeriod, saveRules, savePeriod } from "@/app/admin/rend/actions";
import { WeekDays } from "@/components/schedule/week-days";
import { useT } from "@/i18n/client";
import {
  NTH_WEEKS,
  TIME_RE,
  WEEKDAYS,
  diffServices,
  draftProblems,
  draftToInput,
  newDraft,
  previewWeeks,
  resolvePreview,
  ruleToDraft,
  withDrafts,
  type DraftProblem,
  type RuleDraft,
} from "@/lib/admin/schedule-editor";
import {
  languageName,
  serviceTypeLabel,
  weekRangeLabel,
  type ServiceTypeOption,
} from "@/lib/service-schedule/view";

export interface ScheduleEditorProps {
  locations: Location[];
  data: ScheduleData;
  serviceTypes: ServiceTypeOption[];
  today: string;
  now: number;
  dayContexts: Record<string, DayContext>;
}

/** Languages offered for a service (the church's own first). */
const LANGUAGES = ["hu", "de", "en", "sk", "ro", "hr", "sr", "uk", "la"] as const;

/** The drafts of the stored rules, by time (the order the grid keeps while editing). */
const fromSaved = (rules: readonly ServiceRule[]) =>
  rules.map(ruleToDraft).sort((a, b) => a.time.localeCompare(b.time));

type Feedback = { tone: "success" | "danger"; text: string } | null;

/**
 * Schedule editor (D-22, FR-311): the weekly grid per location and period (with seasonal periods
 * that have validity dates and a priority), and a live preview of the next 8 weeks. The preview is
 * the real `@churchy/schedule` engine on the draft rules, rendered by the same component as the
 * public schedule, with the changes highlighted.
 */
export function ScheduleEditor(props: ScheduleEditorProps) {
  const t = useT("admin.schedule.editor");
  const { locations, data, today } = props;
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const periods = useMemo(
    () =>
      [...data.periods].sort(
        (a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "hu"),
      ),
    [data.periods],
  );
  const [periodId, setPeriodId] = useState(() => {
    const first = locations[0]?.id;
    const used =
      periods.find(
        (p) =>
          isPeriodActive(p, today) &&
          data.rules.some((r) => r.periodId === p.id && r.locationId === first),
      ) ??
      periods.find((p) => data.rules.some((r) => r.periodId === p.id && r.locationId === first));
    return (used ?? periods[0])?.id ?? "";
  });
  const [notice, setNotice] = useState(false);
  const period = periods.find((p) => p.id === periodId) ?? null;
  const saved = useMemo(
    () => data.rules.filter((r) => r.periodId === periodId && r.locationId === locationId),
    [data.rules, periodId, locationId],
  );
  const signature = saved.map((r) => `${r.id}:${r.time}:${r.serviceType}:${r.weekday}`).join(",");

  if (locations.length === 0) {
    return (
      <Alert tone="info" title={t("noLocationsTitle")}>
        <p>{t("noLocations")}</p>
      </Alert>
    );
  }

  return (
    <div className="grid gap-8" data-testid="schedule-editor">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t("location")}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          data-testid="schedule-location"
        />
        <Select
          label={t("period")}
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          options={periods.map((p) => ({ value: p.id, label: p.name }))}
          data-testid="schedule-period"
          placeholder={periods.length === 0 ? t("noPeriods") : undefined}
        />
      </div>

      <PeriodPanel
        key={period?.id ?? "none"}
        period={period}
        onSaved={(id) => id && setPeriodId(id)}
        onDeleted={() => setPeriodId("")}
      />

      {notice ? (
        <div role="status" data-testid="schedule-saved">
          <Alert tone="success">
            <p>{t("saved")}</p>
          </Alert>
        </div>
      ) : null}

      {period ? (
        <RulesGrid
          key={`${locationId}|${periodId}|${signature}`}
          {...props}
          periodId={period.id}
          periodName={period.name}
          locationId={locationId}
          saved={saved}
          onSaved={() => setNotice(true)}
        />
      ) : (
        <Alert tone="info">
          <p>{t("pickPeriod")}</p>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------------------------

function PeriodPanel({
  period,
  onSaved,
  onDeleted,
}: {
  period: ScheduleData["periods"][number] | null;
  onSaved: (id: string | undefined) => void;
  onDeleted: () => void;
}) {
  const t = useT("admin.schedule.editor.periodForm");
  const router = useRouter();
  const [mode, setMode] = useState<"closed" | "edit" | "new">("closed");
  const [name, setName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [yearly, setYearly] = useState(false);
  const [priority, setPriority] = useState("0");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();

  function open(next: "edit" | "new") {
    const source = next === "edit" ? period : null;
    setName(source?.name ?? "");
    setValidFrom(source?.validFrom ?? "");
    setValidTo(source?.validTo ?? "");
    setYearly(source?.yearly ?? false);
    setPriority(String(source?.priority ?? 10));
    setFeedback(null);
    setConfirmDelete(false);
    setMode(next);
  }

  const problem =
    name.trim() === ""
      ? t("nameRequired")
      : yearly && (validFrom === "" || validTo === "")
        ? t("yearlyNeedsDates")
        : !yearly && validFrom !== "" && validTo !== "" && validTo < validFrom
          ? t("endBeforeStart")
          : null;

  function submit() {
    if (problem) {
      setFeedback({ tone: "danger", text: problem });
      return;
    }
    start(async () => {
      const res = await savePeriod({
        ...(mode === "edit" && period ? { id: period.id } : {}),
        name: name.trim(),
        validFrom: validFrom || null,
        validTo: validTo || null,
        yearly,
        priority: Number.parseInt(priority, 10) || 0,
      });
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (!res.value.ok) setFeedback({ tone: "danger", text: t("invalid") });
      else {
        setMode("closed");
        onSaved(res.value.id);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!period) return;
    start(async () => {
      const res = await deletePeriod(period.id);
      if (res.ok && res.value.ok) {
        setMode("closed");
        onDeleted();
        router.refresh();
      } else setFeedback({ tone: "danger", text: t("forbidden") });
    });
  }

  return (
    <section aria-labelledby="period-heading" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="period-heading" className="font-heading text-fs-4 font-semibold">
          {period ? period.name : t("title")}
        </h3>
        {period ? (
          <Badge data-testid="period-validity">
            {period.validFrom || period.validTo ? (
              <>
                {period.validFrom ? (
                  <FormattedDate value={period.validFrom} format="monthDay" />
                ) : (
                  "…"
                )}
                {" – "}
                {period.validTo ? <FormattedDate value={period.validTo} format="monthDay" /> : "…"}
                {period.yearly ? ` · ${t("yearlyShort")}` : ""}
              </>
            ) : (
              t("always")
            )}
          </Badge>
        ) : null}
        {period ? <Badge tone="info">{t("priorityBadge", { n: period.priority })}</Badge> : null}
        <span className="flex gap-2">
          {period ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => open("edit")}
              data-testid="period-edit"
            >
              {t("edit")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => open("new")}
            data-testid="period-new"
          >
            {t("new")}
          </Button>
        </span>
      </div>

      {mode !== "closed" ? (
        <form
          className="grid gap-4 rounded-md border-2 border-border bg-surface-raised p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
          data-testid="period-form"
        >
          <p className="max-w-prose text-fs-2 text-muted sm:col-span-2">{t("help")}</p>
          <Input
            label={t("name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            wrapperClassName="sm:col-span-2"
          />
          <DateInput
            label={t("validFrom")}

            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            optionalLabel={t("optional")}
          />
          <DateInput
            label={t("validTo")}

            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            optionalLabel={t("optional")}
          />
          <Checkbox
            label={t("yearly")}
            help={t("yearlyHelp")}
            checked={yearly}
            onChange={(e) => setYearly(e.target.checked)}
          />
          <Input
            label={t("priority")}
            help={t("priorityHelp")}
            type="number"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
          {feedback ? (
            <Alert tone={feedback.tone} className="sm:col-span-2">
              <p>{feedback.text}</p>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending} data-testid="period-save">
              {t("save")}
            </Button>
            <Button variant="ghost" onClick={() => setMode("closed")}>
              {t("cancel")}
            </Button>
            {mode === "edit" && period ? (
              confirmDelete ? (
                <Button variant="danger" onClick={remove} disabled={pending}>
                  {t("confirmDelete", { name: period.name })}
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  {t("delete")}
                </Button>
              )
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Weekly grid + preview
// ---------------------------------------------------------------------------------------------

function RulesGrid({
  locations,
  data,
  serviceTypes,
  today,
  now,
  dayContexts,
  periodId,
  periodName,
  locationId,
  saved,
  onSaved,
}: ScheduleEditorProps & {
  periodId: string;
  periodName: string;
  locationId: string;
  saved: ServiceRule[];
  onSaved: () => void;
}) {
  const t = useT("admin.schedule.editor");
  const pub = useT("public.schedule");
  const router = useRouter();
  const [drafts, setDrafts] = useState<RuleDraft[]>(() => fromSaved(saved));
  const [weekIndex, setWeekIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const dirty =
    JSON.stringify(drafts.map(draftToInput)) !== JSON.stringify(fromSaved(saved).map(draftToInput));
  const problems = useMemo(() => draftProblems(drafts), [drafts]);
  const defaultType = serviceTypes.find((s) => s.key)?.key ?? "";

  const typeOptions = useMemo<SelectOption[]>(() => {
    const options = serviceTypes.map((s) => ({ value: s.key, label: s.forms.nom }));
    for (const d of drafts) {
      if (d.serviceType && !options.some((o) => o.value === d.serviceType)) {
        options.push({
          value: d.serviceType,
          label: serviceTypeLabel(d.serviceType, serviceTypes),
        });
      }
    }
    return options;
  }, [serviceTypes, drafts]);

  const dayContext: DayContextFn = (date) => dayContexts[date] ?? {};
  const before = useMemo(
    () => resolvePreview({ locations, data }, today, dayContext),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations, data, today, dayContexts],
  );
  const draftData = useMemo(
    () =>
      withDrafts(
        data,
        periodId,
        locationId,
        drafts.filter((d) => TIME_RE.test(d.time)),
      ),
    [data, periodId, locationId, drafts],
  );
  const after = useMemo(
    () => resolvePreview({ locations, data: draftData }, today, dayContext),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations, draftData, today, dayContexts],
  );
  const diff = useMemo(() => diffServices(before, after), [before, after]);
  const changedIds = useMemo(() => new Set(diff.added.map((s) => s.id)), [diff]);

  const weeks = previewWeeks(today);
  const week = weeks[weekIndex] ?? weeks[0];
  const weekDays = after.filter((d) => week && d.date >= week.monday && d.date <= week.sunday);

  const update = (key: string, patch: Partial<RuleDraft>) =>
    setDrafts((all) => all.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  function submit() {
    if (problems.size > 0) {
      setFeedback({ tone: "danger", text: t("fixProblems") });
      return;
    }
    setFeedback(null);
    start(async () => {
      const res = await saveRules(periodId, locationId, drafts.map(draftToInput));
      if (!res.ok) setFeedback({ tone: "danger", text: t("forbidden") });
      else if (!res.value.ok) setFeedback({ tone: "danger", text: t("invalid") });
      else {
        onSaved();
        router.refresh();
      }
    });
  }

  const problemText = (p: DraftProblem) => t(`problems.${p}`);
  const nthLabel = (n: (typeof NTH_WEEKS)[number]) =>
    n === null ? t("nth.every") : n === -1 ? t("nth.last") : t("nth.nth", { n });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:items-start">
      <section aria-labelledby="grid-heading" className="grid gap-5">
        <h3 id="grid-heading" className="font-heading text-fs-5 font-semibold">
          {t("gridTitle", { period: periodName })}
        </h3>
        <p className="max-w-prose text-muted">{t("gridHelp")}</p>

        <div className="grid gap-4" data-testid="rules-grid">
          {WEEKDAYS.map((weekday) => {
            const rows = drafts.filter((d) => d.weekday === weekday);
            return (
              <fieldset
                key={weekday}
                className="grid gap-3 rounded-md border-2 border-border p-4"
                data-weekday={weekday}
              >
                <legend className="px-2 font-heading text-fs-4 font-semibold">
                  {weekdayName(weekday, { capitalize: true })}
                </legend>
                {rows.length === 0 ? <p className="text-fs-2 text-muted">{t("noRules")}</p> : null}
                <ul className="grid gap-4">
                  {rows.map((d) => {
                    const problem = problems.get(d.key);
                    return (
                      <li
                        key={d.key}
                        className="grid gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0"
                        data-testid="rule-row"
                      >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <TimeInput
                            label={t("time")}
                            value={d.time}
                            onChange={(e) => update(d.key, { time: e.target.value })}
                            error={problem === "time" ? problemText(problem) : undefined}
                          />
                          <Select
                            label={t("type")}
                            value={d.serviceType}
                            onChange={(e) => update(d.key, { serviceType: e.target.value })}
                            options={typeOptions}
                            error={
                              problem === "type" || problem === "duplicate"
                                ? problemText(problem)
                                : undefined
                            }
                          />
                          <Select
                            label={t("language")}
                            value={d.language}
                            onChange={(e) => update(d.key, { language: e.target.value })}
                            options={LANGUAGES.map((code) => ({
                              value: code,
                              label: languageName(code),
                            }))}
                          />
                          <Select
                            label={t("nth.label")}
                            value={d.nthWeek === null ? "" : String(d.nthWeek)}
                            onChange={(e) =>
                              update(d.key, {
                                nthWeek:
                                  e.target.value === ""
                                    ? null
                                    : (Number(e.target.value) as RuleDraft["nthWeek"]),
                              })
                            }
                            options={NTH_WEEKS.map((n) => ({
                              value: n === null ? "" : String(n),
                              label: nthLabel(n),
                            }))}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
                          <Input
                            label={t("duration")}
                            type="number"
                            min={1}
                            max={1440}
                            value={String(d.durationMin)}
                            onChange={(e) =>
                              update(d.key, {
                                durationMin: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            error={problem === "duration" ? problemText(problem) : undefined}
                          />
                          <Input
                            label={t("note")}
                            value={d.note}
                            onChange={(e) => update(d.key, { note: e.target.value })}
                            optionalLabel={t("optional")}
                            maxLength={500}
                          />
                          <div className="flex flex-wrap items-end gap-3">
                            <Checkbox
                              label={t("livestream")}
                              checked={d.livestream}
                              onChange={(e) => update(d.key, { livestream: e.target.checked })}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}
                              aria-label={t("removeRule", {
                                day: weekdayName(weekday),
                                time: TIME_RE.test(d.time) ? formatTime(d.time) : d.time,
                              })}
                            >
                              {t("remove")}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDrafts((all) => [...all, newDraft(weekday, { serviceType: defaultType })])
                    }
                    aria-label={t("addRuleDay", { day: weekdayName(weekday) })}
                    data-testid={`add-rule-${weekday}`}
                  >
                    {t("addRule")}
                  </Button>
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3" data-testid="schedule-save-bar">
          <Button onClick={submit} disabled={pending || !dirty} data-testid="rules-save">
            {t("save")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setDrafts(fromSaved(saved))}
            disabled={pending || !dirty}
          >
            {t("discard")}
          </Button>
          <span className="text-fs-2 text-muted" role="status">
            {dirty ? t("dirty") : t("clean")}
          </span>
        </div>
        {feedback ? (
          <Alert tone={feedback.tone}>
            <p>{feedback.text}</p>
          </Alert>
        ) : null}
      </section>

      <section
        aria-labelledby="preview-heading"
        className="grid gap-4"
        data-testid="schedule-preview"
      >
        <h3 id="preview-heading" className="font-heading text-fs-5 font-semibold">
          {t("previewTitle")}
        </h3>
        <p className="text-fs-2 text-muted">{t("previewHelp")}</p>

        <div
          data-testid="preview-changes"
          className="grid gap-2 rounded-md border-2 border-border p-4"
        >
          <h4 className="font-semibold">
            {diff.added.length + diff.removed.length === 0
              ? t("noChanges")
              : t("changesSummary", { added: diff.added.length, removed: diff.removed.length })}
          </h4>
          {diff.removed.length > 0 ? (
            <ul className="grid gap-1 text-fs-2" data-testid="preview-removed">
              {diff.removed.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Badge tone="danger">{t("removedBadge")}</Badge>{" "}
                  <ChangeText service={s} locations={locations} serviceTypes={serviceTypes} />
                </li>
              ))}
              {diff.removed.length > 6 ? (
                <li className="text-muted">{t("more", { n: diff.removed.length - 6 })}</li>
              ) : null}
            </ul>
          ) : null}
          {diff.added.length > 0 ? (
            <ul className="grid gap-1 text-fs-2" data-testid="preview-added">
              {diff.added.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Badge tone="primary">{t("addedBadge")}</Badge>{" "}
                  <ChangeText service={s} locations={locations} serviceTypes={serviceTypes} />
                </li>
              ))}
              {diff.added.length > 6 ? (
                <li className="text-muted">{t("more", { n: diff.added.length - 6 })}</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <Select
          label={t("week")}
          value={String(weekIndex)}
          onChange={(e) => setWeekIndex(Number(e.target.value))}
          options={weeks.map((w, i) => ({
            value: String(i),
            label: `${i === 0 ? `${t("thisWeek")}: ` : ""}${weekRangeLabel(w)}`,
          }))}
          data-testid="preview-week"
        />
        <div data-testid="preview-week-view">
          <WeekDays
            days={weekDays}
            locations={locations}
            showLocation={locations.length > 1}
            serviceTypes={serviceTypes}
            today={today}
            now={now}
            isChanged={(s: Service) => changedIds.has(s.id)}
            labels={{
              today: pub("today"),
              noServices: pub("noServices"),
              badge: (status) => pub(`badges.${status}`),
              language: (code) => pub("language", { language: languageName(code) }),
              originalTime: (time) => pub("originalTime", { time }),
              changed: t("changedBadge"),
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ChangeText({
  service,
  locations,
  serviceTypes,
}: {
  service: Service;
  locations: readonly Location[];
  serviceTypes: readonly ServiceTypeOption[];
}) {
  const place =
    locations.length > 1 ? locations.find((l) => l.id === service.locationId)?.name : null;
  return (
    <span>
      {weekdayName(service.date, { capitalize: true })},{" "}
      <FormattedDate value={service.date} format="monthDay" /> {formatTime(service.time)} ·{" "}
      {serviceTypeLabel(service.serviceType, serviceTypes)}
      {place ? ` · ${place}` : ""}
    </span>
  );
}

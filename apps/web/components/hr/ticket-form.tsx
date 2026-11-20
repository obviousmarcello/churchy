"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Button, Checkbox, DateInput, Input, Select, Textarea } from "@churchy/ui";
import type { FormField } from "@churchy/contracts";
import { breakdown, buildWorkdayCalendar, workingDays, type WorkdayEntry } from "@churchy/hr";
import { FormField as Field } from "@/components/admin/form-field";
import { useT } from "@/i18n/client";
import { INITIAL_FORM_STATE, type FormState } from "@/lib/admin/content-form";
import { fieldName } from "@/lib/requests/form";
import type { PolicyResult } from "@/server/policy";

type SubmitAction = (
  previous: FormState,
  form: FormData,
) => Promise<PolicyResult<FormState | undefined>>;

export interface TicketFormProps {
  action: SubmitAction;
  fields: readonly FormField[];
  /** Absence categories show the working-day calculator. */
  absence: {
    weekdays: readonly number[];
    calendar: readonly WorkdayEntry[];
    remaining: number | null;
  } | null;
  allowAnonymous: boolean;
  cancelHref: string;
}

/**
 * The submission form of an HR category (D-71) with, for leave and other absences, the live
 * working-day calculation (D-73) that uses the same `@churchy/hr` code as the server.
 */
export function TicketForm({
  action,
  fields,
  absence,
  allowAnonymous,
  cancelHref,
}: TicketFormProps) {
  const t = useT("munkater.hr.form");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      const result = await action(previous, form);
      return result.ok ? (result.value ?? INITIAL_FORM_STATE) : { status: "denied" };
    },
    INITIAL_FORM_STATE,
  );
  const errors = state.status === "invalid" ? state.errors : {};
  const [range, setRange] = useState({ from: "", to: "", halfStart: false, halfEnd: false });

  return (
    <form
      action={formAction}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
      data-testid="hr-ticket-form"
      onChange={(event) => {
        const form = new FormData(event.currentTarget);
        setRange({
          from: String(form.get(fieldName("from")) ?? ""),
          to: String(form.get(fieldName("to")) ?? ""),
          halfStart: form.get("halfStart") === "on",
          halfEnd: form.get("halfEnd") === "on",
        });
      }}
    >
      {state.status === "denied" || state.status === "invalid" ? (
        <Alert tone="danger" title={t("errorTitle")} role="alert">
          <p>{errors["_form"] ?? t("errorBody")}</p>
        </Alert>
      ) : null}

      <Input
        name="subject"
        label={t("subject")}
        help={t("subjectHelp")}
        optionalLabel={t("optional")}
      />

      {fields.map((field) => {
        const common = {
          name: fieldName(field.key),
          label: field.label,
          help: field.help ?? undefined,
          error: errors[field.key],
          required: field.required,
          optionalLabel: field.required ? undefined : t("optional"),
        };
        switch (field.type) {
          case "textarea":
            return <Textarea key={field.key} {...common} rows={4} />;
          case "date":
            return <DateInput key={field.key} {...common} />;
          case "checkbox":
            return (
              <Checkbox
                key={field.key}
                name={common.name}
                label={field.label}
                error={common.error}
              />
            );
          case "select":
            return (
              <Select
                key={field.key}
                {...common}
                options={field.options.map((o) => ({ value: o.value, label: o.label }))}
                placeholder={t("choose")}
              />
            );
          case "file":
            return (
              <Field
                key={field.key}
                label={field.label}
                error={common.error}
                optionalLabel={common.optionalLabel}
                required={field.required}
                help={t("fileHelp")}
              >
                {(control) => (
                  <input {...control} type="file" name={common.name} className="block w-full" />
                )}
              </Field>
            );
          default:
            return (
              <Input
                key={field.key}
                type={field.type === "phone" ? "tel" : field.type}
                {...common}
              />
            );
        }
      })}

      {absence ? (
        <>
          <div className="flex flex-wrap gap-6">
            <Checkbox name="halfStart" label={t("halfStart")} />
            <Checkbox name="halfEnd" label={t("halfEnd")} />
          </div>
          <Calculator absence={absence} range={range} />
        </>
      ) : null}

      {allowAnonymous ? (
        <Checkbox name="anonymous" label={t("anonymous")} help={t("anonymousHelp")} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} data-testid="form-submit">
          {t("submit")}
        </Button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center px-2 font-semibold text-primary"
        >
          {t("cancel")}
        </Link>
      </div>
    </form>
  );
}

function Calculator({
  absence,
  range,
}: {
  absence: NonNullable<TicketFormProps["absence"]>;
  range: { from: string; to: string; halfStart: boolean; halfEnd: boolean };
}) {
  const t = useT("munkater.hr.form");
  const valid = range.from !== "" && range.to !== "" && range.to >= range.from;
  const calendar = buildWorkdayCalendar(absence.calendar);
  const days = valid
    ? workingDays({
        weekdays: absence.weekdays,
        startDate: range.from,
        endDate: range.to,
        halfDayStart: range.halfStart,
        halfDayEnd: range.halfEnd,
        calendar,
      })
    : null;
  const holidays = valid
    ? breakdown({ weekdays: absence.weekdays, startDate: range.from, endDate: range.to, calendar })
        .filter((d) => d.kind === "holiday")
        .map((d) => `${d.date.slice(5).replace("-", ".")}.`)
    : [];
  return (
    <div
      className="rounded-md border border-border bg-surface-sunken p-4"
      data-testid="working-days"
      aria-live="polite"
    >
      <p className="font-bold">{t("calcTitle")}</p>
      {days === null ? (
        <p className="text-muted">{t("calcHint")}</p>
      ) : (
        <>
          <p data-testid="working-days-count">{t("calcDays", { count: days })}</p>
          {holidays.length > 0 ? (
            <p className="text-muted">{t("calcHolidays", { days: holidays.join(", ") })}</p>
          ) : null}
          {absence.remaining !== null ? (
            <p className="text-muted">{t("calcRemaining", { count: absence.remaining - days })}</p>
          ) : null}
        </>
      )}
    </div>
  );
}

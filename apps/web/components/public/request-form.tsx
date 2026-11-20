"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormField } from "@churchy/contracts";
import {
  Alert,
  Button,
  ButtonLink,
  Checkbox,
  DateInput,
  Input,
  Select,
  Textarea,
} from "@churchy/ui";
import { useT } from "@/i18n/client";
import {
  REQUEST_HONEYPOT,
  REQUEST_STARTED_AT,
  displayValue,
  fieldErrors,
  fieldName,
  firstErrorStep,
  readSubmission,
  splitSteps,
  type FieldValue,
  type FieldValues,
} from "@/lib/requests/form";
import { INITIAL_REQUEST_STATE, type RequestFormState } from "@/lib/requests/form-state";

type Action = (state: RequestFormState, form: FormData) => Promise<RequestFormState>;

export interface RequestFormDefinition {
  key: string;
  fields: FormField[];
}

const noSubscription = () => () => {};
/** False while rendering on the server and before hydration: the form then works as one page. */
const useEnhanced = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

/**
 * The request form of a rite (D-28): a multi-step form (contact → details → summary and consent)
 * when scripts run, the same form as one page without them — every step is in the markup and the
 * submit button posts the whole form to the server action. Validation happens on the server
 * (Hungarian messages, `noValidate`); the steps check the visible fields before moving on.
 */
export function RequestForm({
  definition,
  action,
  startedAt,
  privacyHref,
  backHref,
}: {
  definition: RequestFormDefinition;
  action: Action;
  /** Render time (ms since epoch) for the time-trap. */
  startedAt: number;
  privacyHref: string;
  backHref: string;
}) {
  const t = useT("public.rites.request");
  // The first render time, kept when the server re-renders the page after an answer.
  const [started] = useState(startedAt);
  const enhanced = useEnhanced();
  const [state, formAction, pending] = useActionState(action, INITIAL_REQUEST_STATE);
  const steps = splitSteps(definition.fields);
  const last = steps.length; // index of the summary / consent step
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const [step, setStep] = useState(0);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<FieldValues>({});
  // A new server answer: jump to the first step with a problem (state adjusted during render).
  const [seen, setSeen] = useState<RequestFormState>(state);
  if (seen !== state) {
    setSeen(state);
    setClientErrors({});
    if (state.status === "invalid") {
      setStep(Object.keys(state.errors).length === 0 ? last : firstErrorStep(steps, state.errors));
    } else if (state.status === "tooFast" || state.status === "rateLimited") setStep(last);
  }

  useEffect(() => {
    if (state.status === "sent") successRef.current?.focus();
    else if (state.status !== "idle") alertRef.current?.focus();
  }, [state]);
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step]);

  if (state.status === "sent") {
    return (
      <div ref={successRef} tabIndex={-1} className="outline-none" data-testid="request-success">
        <Alert tone="success" role="status" title={t("successTitle")}>
          <p>{t("successBody")}</p>
          {state.reference ? (
            <p className="mt-1 text-fs-4 font-semibold" data-testid="request-reference">
              {t("successReference", { reference: state.reference })}
            </p>
          ) : null}
          {state.confirmation !== "" ? <p className="mt-2">{state.confirmation}</p> : null}
        </Alert>
        <p className="mt-4">
          <ButtonLink href={backHref} variant="secondary">
            {t("successHome")}
          </ButtonLink>
        </p>
      </div>
    );
  }

  const values: FieldValues = state.status === "idle" ? {} : state.values;
  const errors = {
    ...clientErrors,
    ...(state.status === "invalid" ? state.errors : {}),
  };
  const messages = {
    required: t("errors.required"),
    invalid: t("errors.invalid"),
    tooLarge: t("errors.tooLarge"),
  };

  function next() {
    const form = formRef.current;
    const current = steps[step];
    if (form === null || current === undefined) return;
    const submission = readSubmission(current.fields, new FormData(form));
    const found = fieldErrors(current.fields, submission, messages);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    if (step + 1 === last) {
      setSummary(readSubmission(definition.fields, new FormData(form)).values);
    }
    setStep(step + 1);
  }

  const labels = { yes: t("yes"), no: t("no"), none: t("none") };
  const stepTitle = (index: number) =>
    index === last
      ? t("stepSummary")
      : steps[index]?.id === "contact"
        ? t("stepContact")
        : t("stepDetails");

  function control(field: FormField) {
    const common = {
      name: fieldName(field.key),
      label: field.label,
      error: errors[field.key],
      required: field.required,
      help: field.help ?? undefined,
    };
    const optional = { optionalLabel: t("optional") };
    const value = values[field.key];
    const text = typeof value === "string" ? value : "";
    switch (field.type) {
      case "text":
        return <Input {...common} {...optional} defaultValue={text} maxLength={200} />;
      case "email":
        return (
          <Input {...common} {...optional} type="email" autoComplete="email" defaultValue={text} />
        );
      case "phone":
        return (
          <Input {...common} {...optional} type="tel" autoComplete="tel" defaultValue={text} />
        );
      case "date":
        return <DateInput {...common} {...optional} defaultValue={text} />;
      case "textarea":
        return <Textarea {...common} {...optional} rows={5} defaultValue={text} maxLength={4000} />;
      case "checkbox":
        return <Checkbox {...common} defaultChecked={value === true} />;
      case "file": {
        const size = t("fileHelp", { size: Math.round(field.maxBytes / (1024 * 1024)) });
        return (
          <Input
            {...common}
            {...optional}
            type="file"
            help={common.help ? `${common.help} ${size}` : size}
          />
        );
      }
      case "select":
        return field.multiple ? (
          <MultiSelect
            field={field}
            error={errors[field.key]}
            selected={Array.isArray(value) ? value : []}
          />
        ) : (
          <Select
            {...common}
            {...optional}
            placeholder={t("choose")}
            options={field.options}
            defaultValue={text}
          />
        );
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="grid max-w-2xl gap-6"
      data-testid="request-form"
      data-enhanced={enhanced ? "true" : "false"}
    >
      <input type="hidden" name="formKey" value={definition.key} />
      <input type="hidden" name={REQUEST_STARTED_AT} value={started} />

      {state.status !== "idle" ? (
        <div ref={alertRef} tabIndex={-1} className="outline-none" data-testid="request-alert">
          <Alert
            tone={state.status === "tooFast" ? "warning" : "danger"}
            role="alert"
            title={
              state.status === "invalid"
                ? t("errorSummary")
                : state.status === "tooFast"
                  ? t("errors.tooFast")
                  : state.status === "rateLimited"
                    ? t("errors.rateLimited")
                    : t("errors.failed")
            }
          />
        </div>
      ) : null}

      {enhanced ? (
        <p className="text-fs-2 font-semibold text-muted" aria-live="polite">
          {t("stepProgress", { current: step + 1, total: last + 1 })}
        </p>
      ) : null}

      {steps.map((s, index) => (
        <fieldset
          key={s.id}
          hidden={enhanced && step !== index}
          className="grid min-w-0 gap-5 border-0 p-0"
          data-testid={`request-step-${s.id}`}
        >
          <legend className="mb-4 p-0 font-heading text-fs-5 font-bold text-primary">
            {enhanced && step === index ? (
              <span ref={headingRef} tabIndex={-1} className="outline-none">
                {stepTitle(index)}
              </span>
            ) : (
              stepTitle(index)
            )}
          </legend>
          {s.fields.map((field) => (
            <div key={field.key}>{control(field)}</div>
          ))}
        </fieldset>
      ))}

      <fieldset
        hidden={enhanced && step !== last}
        className="grid min-w-0 gap-5 border-0 p-0"
        data-testid="request-step-summary"
      >
        <legend className="mb-4 p-0 font-heading text-fs-5 font-bold text-primary">
          {enhanced && step === last ? (
            <span ref={headingRef} tabIndex={-1} className="outline-none">
              {stepTitle(last)}
            </span>
          ) : (
            stepTitle(last)
          )}
        </legend>
        {enhanced ? (
          <>
            <p className="text-fs-3 text-muted">{t("summaryIntro")}</p>
            <dl className="grid gap-3 text-fs-3" data-testid="request-summary">
              {definition.fields.map((field) => (
                <div key={field.key} className="grid gap-0.5">
                  <dt className="font-semibold">{field.label}</dt>
                  <dd className="break-words">
                    {displayValue(field, summary[field.key] as FieldValue | undefined, labels)}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
        {/* Honeypot: off-screen, out of the tab order and hidden from assistive technology. */}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <label htmlFor="request-honeypot">{t("honeypot")}</label>
          <input
            id="request-honeypot"
            type="text"
            name={REQUEST_HONEYPOT}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <Checkbox
          name="consent"
          label={t("consent")}
          labelContent={
            <>
              {t("consent")}{" "}
              <a href={privacyHref} className="font-semibold text-primary underline">
                {t("privacyLink")}
              </a>
            </>
          }
          required
          defaultChecked={false}
          error={state.status === "invalid" ? (state.consentError ?? undefined) : undefined}
        />
      </fieldset>

      <div className="flex flex-wrap gap-3">
        {enhanced && step > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep(step - 1)}
            data-testid="request-back"
          >
            {t("back")}
          </Button>
        ) : null}
        {enhanced && step < last ? (
          <Button type="button" onClick={next} data-testid="request-next">
            {t("next")}
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={pending}
            aria-disabled={pending}
            data-testid="request-submit"
          >
            {pending ? t("sending") : t("submit")}
          </Button>
        )}
      </div>
    </form>
  );
}

/** A multi-select as a group of checkboxes (named like the field; the server reads all values). */
function MultiSelect({
  field,
  selected,
  error,
}: {
  field: Extract<FormField, { type: "select" }>;
  selected: string[];
  error: string | undefined;
}) {
  const t = useT("public.rites.request");
  return (
    <fieldset className="grid gap-1 border-0 p-0">
      <legend className="text-fs-3 font-semibold">
        {field.label}
        {field.required ? null : (
          <span className="ml-1.5 font-normal text-muted">{t("optional")}</span>
        )}
      </legend>
      {field.help ? <p className="text-fs-2 text-muted">{field.help}</p> : null}
      {field.options.map((option) => (
        <Checkbox
          key={option.value}
          name={fieldName(field.key)}
          value={option.value}
          label={option.label}
          defaultChecked={selected.includes(option.value)}
        />
      ))}
      {error ? (
        <p className="text-fs-2 font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

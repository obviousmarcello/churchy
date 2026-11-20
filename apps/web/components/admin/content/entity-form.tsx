"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, Checkbox, DateInput, Input, Select, Textarea } from "@churchy/ui";
import { FormField } from "@/components/admin/form-field";
import { useT } from "@/i18n/client";
import {
  INITIAL_FORM_STATE,
  type FieldDef,
  type FormState,
  type FormValues,
} from "@/lib/admin/content-form";
import type { PolicyResult } from "@/server/policy";
import { ContentField } from "./content-field";

type SaveAction = (
  previous: FormState,
  form: FormData,
) => Promise<PolicyResult<FormState | undefined>>;

export interface EntityFormProps {
  /** A policy-wrapped save action, bound to the item id when editing. */
  action: SaveAction;
  fields: readonly FieldDef[];
  /** Initial values; after a failed save the submitted ones are shown instead. */
  values: FormValues;
  /** Label of the main submit button. */
  submitLabel: string;
  /** Optional second submit button (sends `intent`), e.g. "Közzététel". */
  intentButton?: { value: string; label: string };
  cancelHref: string;
  testId?: string;
}

const controlClass =
  "block w-full min-h-(--control-h-md) rounded-md border-2 border-border-strong bg-surface-raised " +
  "px-4 py-2 text-fs-3 text-text hover:border-text focus-visible:border-primary " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft";

/**
 * One form for every content type (D-21): the page builds the field descriptors (translated),
 * the server action validates and answers with Hungarian messages per field. Validation happens on
 * the server only (`noValidate`), the form keeps what was typed when it is refused.
 */
export function EntityForm({
  action,
  fields,
  values,
  submitLabel,
  intentButton,
  cancelHref,
  testId,
}: EntityFormProps) {
  const t = useT("admin.content.form");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      const result = await action(previous, form);
      return result.ok ? (result.value ?? INITIAL_FORM_STATE) : { status: "denied" };
    },
    INITIAL_FORM_STATE,
  );
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "invalid" || state.status === "denied") summaryRef.current?.focus();
  }, [state]);

  const shown = state.status === "invalid" ? state.values : values;
  const errors = state.status === "invalid" ? state.errors : {};
  const fieldNames = new Set(fields.map((f) => f.name));
  // Problems that belong to no visible field (conflicts, unknown item).
  const general = Object.entries(errors).filter(([name]) => !fieldNames.has(name));

  return (
    <form
      action={formAction}
      noValidate
      className="flex max-w-2xl flex-col gap-5"
      data-testid={testId}
    >
      {state.status === "denied" || state.status === "invalid" ? (
        <div ref={summaryRef} tabIndex={-1} className="outline-none" data-testid="form-errors">
          <Alert
            tone="danger"
            title={state.status === "denied" ? t("deniedTitle") : t("invalidTitle")}
          >
            {state.status === "denied" ? <p>{t("deniedBody")}</p> : null}
            {general.map(([name, message]) => (
              <p key={name}>{message}</p>
            ))}
            {state.status === "invalid" && general.length === 0 ? <p>{t("invalidBody")}</p> : null}
          </Alert>
        </div>
      ) : null}

      {fields.map((field) => {
        const error = errors[field.name];
        const value = shown[field.name] ?? "";
        const common = {
          name: field.name,
          label: field.label,
          help: field.help,
          error,
          required: field.required,
          optionalLabel: field.required ? undefined : t("optional"),
        };
        switch (field.kind) {
          case "heading":
            return (
              <h2 key={field.name} className="mt-4 font-heading text-fs-5 font-bold text-primary">
                {field.label}
              </h2>
            );
          case "content":
            return (
              <ContentField key={field.name} {...common} defaultValue={value} rows={field.rows} />
            );
          case "textarea":
            return (
              <Textarea key={field.name} {...common} defaultValue={value} rows={field.rows ?? 4} />
            );
          case "select":
            return (
              <Select
                key={field.name}
                {...common}
                defaultValue={value}
                options={[...field.options]}
                placeholder={field.placeholder}
              />
            );
          case "checkbox":
            return (
              <Checkbox
                key={field.name}
                name={field.name}
                label={field.label}
                help={field.help}
                error={error}
                defaultChecked={value === "on"}
              />
            );
          case "date":
            return <DateInput key={field.name} {...common} defaultValue={value} />;
          case "datetime-local":
            return (
              <FormField
                key={field.name}
                label={field.label}
                help={field.help}
                error={error}
                required={field.required}
                optionalLabel={common.optionalLabel}
              >
                {(control) => (
                  <input
                    {...control}
                    type="datetime-local"
                    name={field.name}
                    defaultValue={value}
                    className={controlClass}
                  />
                )}
              </FormField>
            );
          default:
            return <Input key={field.name} type={field.kind} {...common} defaultValue={value} />;
        }
      })}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} data-testid="form-submit">
          {submitLabel}
        </Button>
        {intentButton ? (
          <Button
            type="submit"
            name="intent"
            value={intentButton.value}
            variant="secondary"
            disabled={pending}
            data-testid="form-intent"
          >
            {intentButton.label}
          </Button>
        ) : null}
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

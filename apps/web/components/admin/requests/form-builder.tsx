"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Input, Select, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { INITIAL_FORM_STATE, type FormState, type FormValues } from "@/lib/admin/content-form";
import {
  FIELD_TYPES,
  newDraft,
  type BuilderValues,
  type FieldDraft,
  type FieldType,
} from "@/lib/requests/builder";
import type { PolicyResult } from "@/server/policy";

type SaveAction = (
  previous: FormState,
  form: FormData,
) => Promise<PolicyResult<FormState | undefined>>;

export interface FormBuilderProps {
  action: SaveAction;
  /** Saved values (or defaults for a new form). */
  values: Omit<BuilderValues, "fieldsJson">;
  fields: readonly FieldDraft[];
  /** The key of a saved form is fixed. */
  keyLocked: boolean;
  cancelHref: string;
}

/**
 * The form builder (D-28): general settings plus the field list — add, remove, reorder, require
 * and configure fields (text, long text, e-mail, phone, date, checkbox, select, file ≤ 10 MB).
 * The edited list travels as one hidden JSON value; the server validates everything again and
 * answers with Hungarian messages per field.
 */
export function FormBuilder({ action, values, fields, keyLocked, cancelHref }: FormBuilderProps) {
  const t = useT("admin.requests.forms");
  const common = useT("admin.content.form");
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

  const shown: FormValues = state.status === "invalid" ? state.values : (values as FormValues);
  const errors = state.status === "invalid" ? state.errors : {};
  const [drafts, setDrafts] = useState<FieldDraft[]>(() => [...fields]);

  const patch = (index: number, change: Partial<FieldDraft>) =>
    setDrafts((list) => list.map((d, i) => (i === index ? { ...d, ...change } : d)));
  const move = (index: number, by: -1 | 1) =>
    setDrafts((list) => {
      const to = index + by;
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[to]] = [copy[to] as FieldDraft, copy[index] as FieldDraft];
      return copy;
    });

  const fieldErrorCount = Object.keys(errors).length;

  return (
    <form
      action={formAction}
      noValidate
      className="grid max-w-3xl gap-8"
      data-testid="form-builder"
    >
      {state.status === "denied" || state.status === "invalid" ? (
        <div ref={summaryRef} tabIndex={-1} className="outline-none" data-testid="form-errors">
          <Alert
            tone="danger"
            title={state.status === "denied" ? common("deniedTitle") : common("invalidTitle")}
          >
            <p>
              {state.status === "denied"
                ? common("deniedBody")
                : (errors["_form"] ?? (fieldErrorCount > 0 ? common("invalidBody") : ""))}
            </p>
          </Alert>
        </div>
      ) : null}

      <input type="hidden" name="fieldsJson" value={JSON.stringify(drafts)} />

      <section aria-labelledby="builder-general" className="grid gap-5">
        <h2 id="builder-general" className="font-heading text-fs-5 font-bold text-primary">
          {t("general.heading")}
        </h2>
        <Input
          name="title"
          label={t("general.title")}
          required
          maxLength={200}
          defaultValue={shown["title"]}
          error={errors["title"]}
        />
        <Input
          name="key"
          label={t("general.key")}
          help={t("general.keyHelp")}
          required
          maxLength={60}
          defaultValue={shown["key"]}
          readOnly={keyLocked}
          error={errors["key"]}
        />
        <Input
          name="referencePrefix"
          label={t("general.prefix")}
          help={t("general.prefixHelp")}
          required
          maxLength={5}
          defaultValue={shown["referencePrefix"]}
          error={errors["referencePrefix"]}
          wrapperClassName="max-w-48"
        />
        <Textarea
          name="notifyEmails"
          label={t("general.notifyEmails")}
          help={t("general.notifyEmailsHelp")}
          optionalLabel={common("optional")}
          rows={2}
          defaultValue={shown["notifyEmails"]}
          error={errors["notifyEmails"]}
        />
        <Textarea
          name="confirmationText"
          label={t("general.confirmationText")}
          help={t("general.confirmationHelp")}
          optionalLabel={common("optional")}
          rows={4}
          maxLength={2000}
          defaultValue={shown["confirmationText"]}
        />
        <Input
          name="retentionDays"
          type="number"
          label={t("general.retentionDays")}
          help={t("general.retentionHelp")}
          required
          min={1}
          defaultValue={shown["retentionDays"]}
          error={errors["retentionDays"]}
          wrapperClassName="max-w-64"
        />
        <Checkbox
          name="active"
          label={t("general.active")}
          defaultChecked={shown["active"] === "on"}
        />
      </section>

      <section aria-labelledby="builder-fields" className="grid gap-4">
        <h2 id="builder-fields" className="font-heading text-fs-5 font-bold text-primary">
          {t("fields.heading")}
        </h2>
        <p className="text-fs-3 text-muted">{t("fields.help")}</p>
        {drafts.length === 0 ? <p className="text-fs-3">{t("fields.empty")}</p> : null}
        <ol className="grid gap-4" data-testid="builder-fields">
          {drafts.map((draft, index) => {
            const name = draft.label.trim() === "" ? t("fields.newLabel") : draft.label;
            const error = errors[`field.${index}`];
            return (
              <li key={index} data-testid="builder-field">
                <fieldset className="grid gap-4 rounded-md border-2 border-border bg-surface-raised p-4">
                  <legend className="px-2 font-semibold">
                    {t("fields.item", { index: index + 1, label: name })}
                  </legend>
                  {error ? (
                    <p className="text-fs-2 font-semibold text-danger" role="alert">
                      {error}
                    </p>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label={t("fields.label")}
                      value={draft.label}
                      maxLength={200}
                      onChange={(e) => patch(index, { label: e.target.value })}
                    />
                    <Select
                      label={t("fields.type")}
                      value={draft.type}
                      options={FIELD_TYPES.map((type) => ({
                        value: type,
                        label: t(`fields.types.${type}`),
                      }))}
                      onChange={(e) => patch(index, { type: e.target.value as FieldType })}
                    />
                    <Input
                      label={t("fields.key")}
                      value={draft.key}
                      readOnly={!draft.isNew}
                      maxLength={60}
                      onChange={(e) => patch(index, { key: e.target.value })}
                    />
                    <Input
                      label={t("fields.fieldHelp")}
                      optionalLabel={common("optional")}
                      value={draft.help}
                      maxLength={500}
                      onChange={(e) => patch(index, { help: e.target.value })}
                    />
                  </div>
                  {draft.type === "select" ? (
                    <>
                      <Textarea
                        label={t("fields.options")}
                        help={t("fields.optionsHelp")}
                        rows={4}
                        value={draft.optionsText}
                        onChange={(e) => patch(index, { optionsText: e.target.value })}
                      />
                      <Checkbox
                        label={t("fields.multiple")}
                        checked={draft.multiple}
                        onChange={(e) => patch(index, { multiple: e.target.checked })}
                      />
                    </>
                  ) : null}
                  <Checkbox
                    label={t("fields.required")}
                    checked={draft.required}
                    onChange={(e) => patch(index, { required: e.target.checked })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      aria-label={t("fields.up", { label: name })}
                      onClick={() => move(index, -1)}
                    >
                      <span aria-hidden="true">↑</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={index === drafts.length - 1}
                      aria-label={t("fields.down", { label: name })}
                      onClick={() => move(index, 1)}
                    >
                      <span aria-hidden="true">↓</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("fields.remove", { label: name })}
                      onClick={() => setDrafts((list) => list.filter((_, i) => i !== index))}
                      data-testid="builder-remove"
                    >
                      {t("fields.removeButton")}
                    </Button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDrafts((list) => [...list, newDraft(list)])}
            data-testid="builder-add"
          >
            {t("fields.add")}
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} data-testid="form-submit">
          {t("submit")}
        </Button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center font-semibold text-primary"
        >
          {common("cancel")}
        </Link>
      </div>
    </form>
  );
}

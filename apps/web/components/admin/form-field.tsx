import { useId, type ReactNode } from "react";
import { DangerIcon } from "@churchy/ui";

/** What a control inside a `FormField` must spread to be labelled and described. */
export interface FormFieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export interface FormFieldProps {
  /** Visible label. Always required: placeholders are not labels. */
  label: string;
  /** Plain-language help under the control (SDD §11.2: help text under each field). */
  help?: string;
  /** Error text; also marks the control invalid. */
  error?: string;
  /** Suffix for optional fields, e.g. `t("admin.form.optional")`. */
  optionalLabel?: string;
  required?: boolean;
  /** The control, built from the ids to wire up. */
  children: (control: FormFieldControlProps) => ReactNode;
}

/**
 * Label + control + help + error for controls that `@churchy/ui` does not wrap (editor, media
 * picker, date-range …). For text inputs, selects and checkboxes use `Input`, `Select`,
 * `Textarea`, `Checkbox` from `@churchy/ui` instead: they already do this.
 *
 * ```tsx
 * <FormField label={t("title")} help={t("titleHelp")}>
 *   {(control) => <RichTextEditor {...control} />}
 * </FormField>
 * ```
 */
export function FormField({
  label,
  help,
  error,
  optionalLabel,
  required = false,
  children,
}: FormFieldProps) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-fs-3 font-bold text-text">
        {label}
        {optionalLabel && !required ? (
          <span className="ml-1.5 font-normal text-muted">{optionalLabel}</span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-2 text-fs-2 font-semibold text-danger">
          <DangerIcon className="mt-0.5 size-5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {help ? (
        <p id={helpId} className="text-fs-2 text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

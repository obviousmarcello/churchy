import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cn } from "../cn";
import { CheckIcon, ChevronDownIcon, DangerIcon } from "../icons";

/** Props every labelled form control shares. All text arrives via props. */
export interface FieldProps {
  /** Visible label. Always required: placeholders are not labels. */
  label: string;
  /** Help text shown under the control and linked with `aria-describedby`. */
  help?: string;
  /** Error message. Setting it marks the control `aria-invalid`. */
  error?: string;
  /** Text appended to the label of optional fields, e.g. "(nem kötelező)". */
  optionalLabel?: string;
  /** Wrapper class (layout only). */
  wrapperClassName?: string;
}

function useFieldIds(idProp: string | undefined, help?: string, error?: string) {
  const generated = useId();
  const id = idProp ?? generated;
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;
  return { id, helpId, errorId, describedBy };
}

function Messages({
  help,
  error,
  helpId,
  errorId,
}: {
  help?: string;
  error?: string;
  helpId?: string;
  errorId?: string;
}) {
  return (
    <>
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-fs-2 font-semibold text-danger">
          <DangerIcon className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {help ? (
        <p id={helpId} className="text-fs-2 text-muted">
          {help}
        </p>
      ) : null}
    </>
  );
}

function LabelText({
  label,
  optionalLabel,
  required,
}: {
  label: string;
  optionalLabel?: string;
  required?: boolean;
}) {
  return (
    <>
      {label}
      {optionalLabel && !required ? (
        <span className="ml-1.5 font-normal text-muted">{optionalLabel}</span>
      ) : null}
    </>
  );
}

/*
 * Design v2: 14–16 px radius (`--radius-control`), the 3:1 control border stays (WCAG 1.4.11), a
 * soft halo in the brand colour grows around the focused field next to the global focus outline.
 */
const controlBase =
  "block w-full min-h-(--control-h-md) rounded-control border border-border-strong bg-surface-raised " +
  "px-4 py-2 text-fs-3 text-text shadow-xs placeholder:text-muted " +
  "transition-[border-color,box-shadow,background-color] duration-(--dur-2) ease-standard " +
  "hover:border-text focus-visible:border-primary " +
  "focus-visible:shadow-[0_0_0_5px_color-mix(in_oklab,var(--c-primary)_14%,transparent)] aria-[invalid=true]:border-danger " +
  "aria-[invalid=true]:bg-danger-soft disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted disabled:shadow-none";

const labelClass = "text-fs-3 leading-snug font-semibold text-text";

type InputBase = Omit<ComponentPropsWithRef<"input">, "type"> & FieldProps;

function TextLikeInput({ type, ...props }: InputBase & { type: string }) {
  const {
    label,
    help,
    error,
    optionalLabel,
    wrapperClassName,
    id: idProp,
    className,
    ...rest
  } = props;
  const { id, helpId, errorId, describedBy } = useFieldIds(idProp, help, error);
  return (
    <div className={cn("grid gap-1.5", wrapperClassName)}>
      <label htmlFor={id} className={labelClass}>
        <LabelText label={label} optionalLabel={optionalLabel} required={rest.required} />
      </label>
      <input
        id={id}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(controlBase, className)}
        {...rest}
      />
      <Messages help={help} error={error} helpId={helpId} errorId={errorId} />
    </div>
  );
}

export type InputProps = InputBase & {
  type?: "text" | "email" | "tel" | "url" | "search" | "number" | "password" | "file";
};

/** Single-line text input with label, help text and error state. */
export function Input({ type = "text", ...props }: InputProps) {
  return <TextLikeInput type={type} {...props} />;
}

/** Native date input (`YYYY-MM-DD` value; the browser renders the Hungarian format). */
export function DateInput(props: InputBase) {
  return <TextLikeInput type="date" {...props} className={cn("min-w-0", props.className)} />;
}

/** Native time input (24-hour `HH:MM` value). */
export function TimeInput(props: InputBase) {
  return <TextLikeInput type="time" {...props} className={cn("min-w-0", props.className)} />;
}

export type TextareaProps = ComponentPropsWithRef<"textarea"> & FieldProps;

export function Textarea({
  label,
  help,
  error,
  optionalLabel,
  wrapperClassName,
  id: idProp,
  className,
  rows = 5,
  ...rest
}: TextareaProps) {
  const { id, helpId, errorId, describedBy } = useFieldIds(idProp, help, error);
  return (
    <div className={cn("grid gap-1.5", wrapperClassName)}>
      <label htmlFor={id} className={labelClass}>
        <LabelText label={label} optionalLabel={optionalLabel} required={rest.required} />
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(controlBase, "min-h-28 resize-y py-3", className)}
        {...rest}
      />
      <Messages help={help} error={error} helpId={helpId} errorId={errorId} />
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = Omit<ComponentPropsWithRef<"select">, "children"> &
  FieldProps & {
    options: SelectOption[];
    /** Text of the empty first option ("Válasszon…"); omit when a value is always preselected. */
    placeholder?: string;
  };

/** Native `<select>` (best accessibility and mobile UX) with a custom chevron. */
export function Select({
  label,
  help,
  error,
  optionalLabel,
  wrapperClassName,
  id: idProp,
  className,
  options,
  placeholder,
  ...rest
}: SelectProps) {
  const { id, helpId, errorId, describedBy } = useFieldIds(idProp, help, error);
  return (
    <div className={cn("grid gap-1.5", wrapperClassName)}>
      <label htmlFor={id} className={labelClass}>
        <LabelText label={label} optionalLabel={optionalLabel} required={rest.required} />
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, "appearance-none pr-12", className)}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled={rest.required}>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-text" />
      </div>
      <Messages help={help} error={error} helpId={helpId} errorId={errorId} />
    </div>
  );
}

export type CheckboxProps = Omit<ComponentPropsWithRef<"input">, "type"> &
  Omit<FieldProps, "optionalLabel"> & {
    /** Rich label (e.g. with a link to the privacy notice). Overrides `label` text rendering. */
    labelContent?: ReactNode;
  };

/**
 * Checkbox. The whole label row is the hit area (at least `--control-h-md` tall); the visible box is
 * 24 px. Label, help and error are linked to the input for assistive technology.
 */
export function Checkbox({
  label,
  labelContent,
  help,
  error,
  wrapperClassName,
  id: idProp,
  className,
  ...rest
}: CheckboxProps) {
  const { id, helpId, errorId, describedBy } = useFieldIds(idProp, help, error);
  return (
    <div className={cn("grid gap-1", wrapperClassName)}>
      <label
        htmlFor={id}
        className="flex min-h-(--control-h-md) cursor-pointer items-start gap-3 py-2 text-fs-3 text-text has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted"
      >
        <span className="relative mt-px inline-grid size-6 shrink-0 place-items-center">
          <input
            id={id}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "peer size-6 cursor-[inherit] appearance-none rounded-[7px] border-[1.5px] border-border-strong bg-surface-raised",
              "transition-[background-color,border-color,scale] duration-(--dur-2) ease-spring hover:border-text active:scale-90",
              "checked:border-primary checked:bg-primary",
              "aria-[invalid=true]:border-danger disabled:bg-surface-sunken",
              className,
            )}
            {...rest}
          />
          <CheckIcon className="pointer-events-none absolute size-4 scale-50 text-primary-contrast opacity-0 transition-[opacity,scale] duration-(--dur-2) ease-spring peer-checked:scale-100 peer-checked:opacity-100" />
        </span>
        <span className="leading-snug">{labelContent ?? label}</span>
      </label>
      <div className="grid gap-1.5 pl-9">
        <Messages help={help} error={error} helpId={helpId} errorId={errorId} />
      </div>
    </div>
  );
}

export interface FieldsetProps {
  /** Group heading, e.g. "Elérhetőség". */
  legend: string;
  /** One sentence under the legend. */
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Groups related fields under a legend; fields inside are spaced with `--space-stack`. */
export function Fieldset({ legend, description, children, className }: FieldsetProps) {
  return (
    <fieldset className={cn("grid min-w-0 gap-(--space-stack)", className)}>
      <legend className="mb-1 font-heading text-section-title [font-weight:var(--fw-heading-sm,var(--fw-heading))] text-text">
        {legend}
      </legend>
      {description ? <p className="-mt-2 text-fs-2 text-muted">{description}</p> : null}
      {children}
    </fieldset>
  );
}

/**
 * The button row at the end of a form: primary action first, then secondary ones, then the inline
 * `SaveStatus`. A hairline separates it from the fields.
 */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-3 border-t border-divider pt-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type RadioProps = Omit<ComponentPropsWithRef<"input">, "type"> &
  Omit<FieldProps, "optionalLabel" | "error"> & {
    /** Rich label. Overrides `label` text rendering. */
    labelContent?: ReactNode;
  };

/**
 * One radio option (design v2): a 24 px ring whose dot pops in with a spring. The whole label row is
 * the hit area. Group radios with the same `name` inside a `Fieldset` (its legend is the question);
 * for 2–5 short, equal options prefer `SegmentedControl`.
 */
export function Radio({
  label,
  labelContent,
  help,
  wrapperClassName,
  id: idProp,
  className,
  ...rest
}: RadioProps) {
  const { id, helpId, describedBy } = useFieldIds(idProp, help);
  return (
    <div className={cn("grid gap-1", wrapperClassName)}>
      <label
        htmlFor={id}
        className="flex min-h-(--control-h-md) cursor-pointer items-start gap-3 py-2 text-fs-3 text-text has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted"
      >
        <span className="relative mt-px inline-grid size-6 shrink-0 place-items-center">
          <input
            id={id}
            type="radio"
            aria-describedby={describedBy}
            className={cn(
              "peer size-6 cursor-[inherit] appearance-none rounded-full border-[1.5px] border-border-strong bg-surface-raised",
              "transition-[border-color,scale] duration-(--dur-2) ease-spring hover:border-text active:scale-90",
              "checked:border-primary disabled:bg-surface-sunken",
              className,
            )}
            {...rest}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-3 scale-0 rounded-full bg-primary transition-transform duration-(--dur-2) ease-spring peer-checked:scale-100"
          />
        </span>
        <span className="leading-snug">{labelContent ?? label}</span>
      </label>
      {help ? (
        <p id={helpId} className="pl-9 text-fs-2 text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

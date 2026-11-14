/** Builders for form fields (output type of `FormFieldSchema`, all defaults filled). */
import type { FormField } from "@churchy/contracts";

const base = (key: string, label: string, required: boolean, help: string | null) => ({
  key,
  label,
  required,
  help,
});

export const fText = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "text",
});
export const fArea = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "textarea",
});
export const fEmail = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "email",
});
export const fPhone = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "phone",
});
export const fDate = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "date",
});
export const fCheck = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "checkbox",
});
export const fSelect = (
  key: string,
  label: string,
  options: [value: string, label: string][],
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "select",
  options: options.map(([value, l]) => ({ value, label: l })),
  multiple: false,
});
export const fFile = (
  key: string,
  label: string,
  required = false,
  help: string | null = null,
): FormField => ({
  ...base(key, label, required, help),
  type: "file",
  maxBytes: 5 * 1024 * 1024,
});

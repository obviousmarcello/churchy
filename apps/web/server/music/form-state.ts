import "server-only";

import { refresh } from "next/cache";

import { createI18n, type I18n, type Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import { LOG_MESSAGES, ModuleOffError, SafeError, ValidationError } from "./errors";

// Helpers for Server Actions that serve a form with `useActionState`. They
// turn the form fields into model input and model errors into form state.
// The messages are in the language of the request (`getRequestI18n()`).

export type FormState = {
  status: "idle" | "success" | "error";
  /** A message for the whole form: the result, or an error such as a missing permission. */
  message: string | null;
  /** Errors by field, e.g. `title` or `email`. */
  fieldErrors: Record<string, string[]>;
  /** `moduleOff`: the module of the form is off now. The client loads the page again (see `useModuleOffRefresh`). */
  code?: "moduleOff";
};

/** A text field, or "" when the field is missing or is a file. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A file field, or undefined when no file is chosen: an empty file field sends an empty file. */
export function file(formData: FormData, name: string): File | undefined {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
}

/**
 * The issues by the first part of their path, e.g. `sections.0.title` goes to
 * `sections`. With `fullPaths`, by the whole path (`theme.radius`), for a form
 * that sends nested values in one field.
 */
export function fieldErrorsOf(
  error: ValidationError,
  i18n: I18n,
  fullPaths = false,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = (fullPaths ? issue.path : issue.path.split(".")[0]) || "form";
    (fieldErrors[field] ??= []).push(issue.message(i18n));
  }
  return fieldErrors;
}

export function fieldError(field: string, message: string): FormState {
  return { status: "error", message: null, fieldErrors: { [field]: [message] } };
}

/**
 * The form state for an error from a model. Errors with a safe message show
 * it. Other errors are logged on the server and show `failure`.
 */
export async function errorState(
  error: unknown,
  failure: Text,
  fullPaths = false,
): Promise<FormState> {
  const i18n = await getRequestI18n();
  if (error instanceof ValidationError) {
    return {
      status: "error",
      message: i18n.m.common.form.correctFields,
      fieldErrors: fieldErrorsOf(error, i18n, fullPaths),
    };
  }
  if (error instanceof ModuleOffError) {
    return { status: "error", message: error.text(i18n), fieldErrors: {}, code: "moduleOff" };
  }
  if (error instanceof SafeError) {
    return { status: "error", message: error.text(i18n), fieldErrors: {} };
  }
  console.error(`[form] ${failure(createI18n(LOG_MESSAGES))}`, error);
  return { status: "error", message: failure(i18n), fieldErrors: {} };
}

/**
 * Runs a model update that returns false when the record does not exist.
 * After a success, the page shows the new values. Call it only from a Server
 * Action: `refresh()` works only there. `fullPaths`: see `fieldErrorsOf`.
 */
export async function runUpdate(
  messages: { success: Text; failure: Text; notFound: Text },
  update: () => Promise<boolean>,
  { fullPaths = false }: { fullPaths?: boolean } = {},
): Promise<FormState> {
  try {
    if (!(await update())) {
      return {
        status: "error",
        message: messages.notFound(await getRequestI18n()),
        fieldErrors: {},
      };
    }
  } catch (error) {
    return errorState(error, messages.failure, fullPaths);
  }

  refresh();
  return { status: "success", message: messages.success(await getRequestI18n()), fieldErrors: {} };
}

/** The result of a save without a form: one message, no fields. */
export type SaveResult =
  { status: "success" } | { status: "error"; message: string; code?: "moduleOff" };

/**
 * Runs a model save without a form, e.g. from a popover of the chord sheet,
 * which shows the new value before the result. `save` returns false when the
 * record does not exist. There are no fields, so a field error becomes the
 * message, not "correct the fields".
 */
export async function runSave(
  messages: { failure: Text; notFound: Text },
  save: () => Promise<boolean>,
): Promise<SaveResult> {
  try {
    if (await save()) return { status: "success" };
    return { status: "error", message: messages.notFound(await getRequestI18n()) };
  } catch (cause) {
    const state = await errorState(cause, messages.failure);
    const fieldError = Object.values(state.fieldErrors).flat()[0];
    return {
      status: "error",
      message: fieldError ?? state.message ?? "",
      ...(state.code && { code: state.code }),
    };
  }
}

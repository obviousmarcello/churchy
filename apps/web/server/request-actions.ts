"use server";

import { redirect } from "next/navigation";
import { isContractError, RequestStatusSchema, type RequestStatus } from "@churchy/contracts";
import { getT } from "@/i18n/server";
import type { FormState } from "@/lib/admin/content-form";
import {
  BUILDER_FIELDS,
  parseBuilder,
  type BuilderMessages,
  type BuilderValues,
} from "@/lib/requests/builder";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Mutations of the requests inbox and the form builder (D-28, D-29). Each one goes through
 * `withPolicy()`: the actor needs `pastoralRequest.handle` in the request's church. Handling
 * actions answer `"ok" | "invalid" | "notFound"`; the builder returns the form state (field
 * errors) or redirects to the saved form.
 */

export type RequestOutcome = "ok" | "invalid" | "notFound";

async function guarded(run: () => Promise<unknown>): Promise<RequestOutcome> {
  try {
    await run();
    return "ok";
  } catch (error) {
    if (isContractError(error, "NOT_FOUND")) return "notFound";
    if (isContractError(error, "VALIDATION") || isContractError(error, "CONFLICT")) {
      return "invalid";
    }
    throw error;
  }
}

/** The request's church as the policy resource (`null` in an organization context: 404). */
async function tenant<Args extends unknown[]>(_scope: PolicyScope, ..._args: Args) {
  const { tenantId } = await getRequestContext();
  return tenantId === undefined ? null : { tenantId };
}

// --- inbox -------------------------------------------------------------------------------------

export const setRequestStatus = withPolicy(
  "pastoralRequest.handle",
  tenant<[id: string, status: RequestStatus]>,
  async (scope, id: string, status: RequestStatus) => {
    if (!RequestStatusSchema.safeParse(status).success) return "invalid" as const;
    const { requests } = await getRequestRepositories();
    return guarded(() => requests.setStatus(scope.ctx, id, status));
  },
);

export const assignRequest = withPolicy(
  "pastoralRequest.handle",
  tenant<[id: string, userId: string | null]>,
  async (scope, id: string, userId: string | null) => {
    const { requests } = await getRequestRepositories();
    return guarded(() => requests.assign(scope.ctx, id, userId));
  },
);

export const addRequestNote = withPolicy(
  "pastoralRequest.handle",
  tenant<[id: string, body: string]>,
  async (scope, id: string, body: string) => {
    const { requests } = await getRequestRepositories();
    return guarded(() => requests.addNote(scope.ctx, id, body));
  },
);

// --- form builder ------------------------------------------------------------------------------

async function builderMessages(): Promise<BuilderMessages> {
  const t = await getT("admin.requests.forms.errors");
  return {
    title: t("title"),
    key: t("key"),
    keyTaken: t("keyTaken"),
    prefix: t("prefix"),
    emails: t("emails"),
    retention: t("retention"),
    fieldLabel: t("fieldLabel"),
    fieldKey: t("fieldKey"),
    fieldKeyTaken: t("fieldKeyTaken"),
    options: t("options"),
    general: t("general"),
  };
}

function builderValues(form: FormData): BuilderValues {
  const out = {} as BuilderValues;
  for (const name of BUILDER_FIELDS) {
    const value = form.get(name);
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

/** Create (`existingKey` null) or update a form definition from the builder's submission. */
export const saveFormDefinition = withPolicy(
  "pastoralRequest.handle",
  tenant<[existingKey: string | null, previous: FormState, form: FormData]>,
  async (
    scope,
    existingKey: string | null,
    _previous: FormState,
    form: FormData,
  ): Promise<FormState> => {
    const { requests } = await getRequestRepositories();
    const values = builderValues(form);
    const messages = await builderMessages();
    const invalid = (errors: Record<string, string>): FormState => ({
      status: "invalid",
      errors,
      values,
    });

    const forms = await requests.listForms(scope.ctx, { includeInactive: true });
    const existing = existingKey === null ? null : forms.find((f) => f.key === existingKey);
    if (existing === undefined) return invalid({ _form: messages.general });

    const result = parseBuilder(
      values,
      existing === null ? null : { id: existing.id, key: existing.key },
      forms.map((f) => f.key),
      messages,
    );
    if (!result.ok) return invalid(result.errors);
    try {
      const saved = await requests.upsertForm(scope.ctx, result.input);
      redirect(`/admin/kerelmek/urlapok/${saved.key}?mentve=1`);
    } catch (error) {
      if (isContractError(error, "CONFLICT")) return invalid({ key: messages.keyTaken });
      if (isContractError(error)) return invalid({ _form: messages.general });
      throw error;
    }
  },
);

export const deleteFormDefinition = withPolicy(
  "pastoralRequest.handle",
  tenant<[id: string]>,
  async (scope, id: string) => {
    const { requests } = await getRequestRepositories();
    return guarded(() => requests.deleteForm(scope.ctx, id));
  },
);

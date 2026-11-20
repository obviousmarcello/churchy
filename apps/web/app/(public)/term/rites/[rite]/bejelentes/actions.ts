"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { isContractError } from "@churchy/contracts";
import { getT } from "@/i18n/server";
import {
  MIN_FILL_MS,
  REQUEST_HONEYPOT,
  REQUEST_STARTED_AT,
  fieldErrors,
  readSubmission,
} from "@/lib/requests/form";
import type { RequestFormState } from "@/lib/requests/form-state";
import { publicAction } from "@/server/policy";
import { getPublicCtx } from "@/server/public-site";
import { clientAddress, limiterKey, requestLimiter } from "@/server/request-limiter";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Submission of a rite request form (D-28): honeypot, time-trap, Hungarian validation against the
 * form definition, a rate limit (≤ 5 per hour per hashed IP and church), then `requests.submit`
 * through the repository interface. The mock adapter writes the office notification (reference and
 * link only) and the requester confirmation to the demo outbox. An anonymous public submission,
 * so a `publicAction()` exemption of the policy wrapper (D-05): it writes with the public ctx only.
 */
export const submitRequest = publicAction(async function submitRequest(
  _previous: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  const [ctx, repos, t] = await Promise.all([
    getPublicCtx(),
    getRequestRepositories(),
    getT("public.rites.request"),
  ]);
  const definition = await repos.requests.getForm(ctx, text("formKey"));
  const failed: RequestFormState = { status: "failed", values: {} };
  if (definition === null || !definition.active) return failed;
  // `getPublicCtx()` always carries a church.
  const tenantId = ctx.tenantId ?? "";

  // A bot filled the hidden field: pretend success, send nothing.
  if (text(REQUEST_HONEYPOT).trim() !== "") {
    return { status: "sent", reference: null, confirmation: definition.confirmationText };
  }

  const submission = readSubmission(definition.fields, form);
  const startedAt = Number(text(REQUEST_STARTED_AT));
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return { status: "tooFast", values: submission.values };
  }

  const errors = fieldErrors(definition.fields, submission, {
    required: t("errors.required"),
    invalid: t("errors.invalid"),
    tooLarge: t("errors.tooLarge"),
  });
  const consented = form.get("consent") === "on";
  if (Object.keys(errors).length > 0 || !consented) {
    return {
      status: "invalid",
      errors,
      consentError: consented ? null : t("errors.consent"),
      values: submission.values,
    };
  }

  const key = limiterKey(tenantId, clientAddress(await headers()));
  if (!requestLimiter().take(key, Date.now())) {
    return { status: "rateLimited", values: submission.values };
  }

  try {
    const { reference } = await repos.requests.submit(ctx, {
      formKey: definition.key,
      data: submission.data,
      consent: true,
      consentTextHash: createHash("sha256").update(t("consent")).digest("hex"),
    });
    return { status: "sent", reference, confirmation: definition.confirmationText };
  } catch (error) {
    // No details to the visitor and no content in logs (CLAUDE.md privacy rules).
    if (isContractError(error, "VALIDATION")) {
      return { status: "invalid", errors: {}, consentError: null, values: submission.values };
    }
    return { status: "failed", values: submission.values };
  }
});

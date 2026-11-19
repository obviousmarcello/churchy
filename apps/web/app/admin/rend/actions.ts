"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  IdSchema,
  SchedulePeriodInputSchema,
  ServiceExceptionInputSchema,
  ServiceRuleInputSchema,
  isContractError,
} from "@churchy/contracts";
import type { SchedulePeriodInput, ServiceExceptionInput } from "@churchy/contracts";
import { withPolicy, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Schedule mutations (D-22): periods, the weekly rules of one period at one location and the
 * exceptions. Each goes through the policy wrapper (`schedule.edit`: the office role and above,
 * the editor role cannot), is validated again here (the editor's checks are a convenience, not the
 * guard) and shows on the public schedule on the next request.
 */

export type ScheduleSaveResult =
  { ok: true; id?: string } | { ok: false; error: "invalid" | "notFound" };

/** The request's church as the policy resource; `null` (404) outside a church context. */
const tenantResource = ({ context }: PolicyScope) =>
  context.tenantId === undefined ? null : { tenantId: context.tenantId };

async function run(write: () => Promise<string | void>): Promise<ScheduleSaveResult> {
  let id: string | void;
  try {
    id = await write();
  } catch (error) {
    if (isContractError(error, "NOT_FOUND")) return { ok: false, error: "notFound" };
    if (isContractError(error, "VALIDATION")) return { ok: false, error: "invalid" };
    throw error;
  }
  revalidatePath("/", "layout");
  return id === undefined ? { ok: true } : { ok: true, id };
}

/** Create or update a period (*Időszak*): name, validity, yearly flag and priority. */
export const savePeriod = withPolicy(
  "schedule.edit",
  (scope: PolicyScope, _input: SchedulePeriodInput) => tenantResource(scope),
  async (scope, input): Promise<ScheduleSaveResult> => {
    const parsed = SchedulePeriodInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { schedule } = await getRequestRepositories();
    return run(async () => (await schedule.upsertPeriod(scope.ctx, parsed.data)).id);
  },
);

/** Delete a period and its rules. */
export const deletePeriod = withPolicy(
  "schedule.edit",
  (scope: PolicyScope, _id: string) => tenantResource(scope),
  async (scope, id): Promise<ScheduleSaveResult> => {
    const { schedule } = await getRequestRepositories();
    return run(() => schedule.deletePeriod(scope.ctx, id));
  },
);

const RuleList = z.array(
  ServiceRuleInputSchema.omit({ id: true, periodId: true, locationId: true }),
);

/** Replace all rules of one period at one location (the weekly grid's save). */
export const saveRules = withPolicy(
  "schedule.edit",
  (scope: PolicyScope, _periodId: string, _locationId: string, _rules: z.input<typeof RuleList>) =>
    tenantResource(scope),
  async (scope, periodId, locationId, rules): Promise<ScheduleSaveResult> => {
    const parsed = RuleList.safeParse(rules);
    if (!parsed.success || !IdSchema.safeParse(periodId).success) {
      return { ok: false, error: "invalid" };
    }
    const { schedule } = await getRequestRepositories();
    return run(
      async () => void (await schedule.replaceRules(scope.ctx, periodId, locationId, parsed.data)),
    );
  },
);

const ExceptionList = z.array(ServiceExceptionInputSchema).min(1).max(60);

/** Save one or more exceptions (a single date, or a holiday template's dates). */
export const saveExceptions = withPolicy(
  "schedule.edit",
  (scope: PolicyScope, _inputs: ServiceExceptionInput[]) => tenantResource(scope),
  async (scope, inputs): Promise<ScheduleSaveResult> => {
    const parsed = ExceptionList.safeParse(inputs);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { schedule } = await getRequestRepositories();
    return run(async () => {
      for (const input of parsed.data) await schedule.upsertException(scope.ctx, input);
    });
  },
);

/** Delete an exception (the service is back to its regular time). */
export const deleteException = withPolicy(
  "schedule.edit",
  (scope: PolicyScope, _id: string) => tenantResource(scope),
  async (scope, id): Promise<ScheduleSaveResult> => {
    const { schedule } = await getRequestRepositories();
    return run(() => schedule.deleteException(scope.ctx, id));
  },
);

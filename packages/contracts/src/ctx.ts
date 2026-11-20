import { z } from "zod";
import { ContractError } from "./errors";
import { IdSchema } from "./primitives";

/**
 * Who performs a repository call. `userId === null` means an anonymous public-site visitor;
 * `personId` links the user to their `people` record (null for platform users or users without one).
 */
export const ActorSchema = z.object({
  userId: IdSchema.nullable(),
  personId: IdSchema.nullable(),
});
export type Actor = z.infer<typeof ActorSchema>;

/**
 * Explicit context passed as the first argument of EVERY repository method (SDD §4.4).
 * The DB adapter maps it to `SET LOCAL app.tenant_id` / `app.org_id`.
 *
 * - tenant ctx: `tenantId` set — church website, admin and workspace;
 * - organization ctx: `orgId` set — diocesan portal (HR tables only, SDD §25.7);
 * - platform ctx: neither set — host resolution, provisioning, platform catalogs.
 *
 * A ctx must never carry both `tenantId` and `orgId` (SDD §25.7, D-85 AC4).
 */
export type Ctx = { tenantId?: string; orgId?: string; actor: Actor };

export const CtxSchema = z
  .object({
    tenantId: IdSchema.optional(),
    orgId: IdSchema.optional(),
    actor: ActorSchema,
  })
  .refine((ctx) => !(ctx.tenantId !== undefined && ctx.orgId !== undefined), {
    message: "A context must not carry both tenantId and orgId",
    path: ["orgId"],
  });

export type CtxScope =
  { kind: "tenant"; tenantId: string } | { kind: "org"; orgId: string } | { kind: "platform" };

/** Throws `ContractError("CONTEXT")` unless `ctx` is well-formed (incl. the tenant/org exclusivity). */
export function assertValidCtx(ctx: unknown): asserts ctx is Ctx {
  const result = CtxSchema.safeParse(ctx);
  if (!result.success) {
    throw new ContractError("CONTEXT", result.error.issues[0]?.message ?? "Invalid context");
  }
}

/** Validates `ctx` and tells which scope it addresses. */
export function ctxScope(ctx: Ctx): CtxScope {
  assertValidCtx(ctx);
  if (ctx.tenantId !== undefined) return { kind: "tenant", tenantId: ctx.tenantId };
  if (ctx.orgId !== undefined) return { kind: "org", orgId: ctx.orgId };
  return { kind: "platform" };
}

/** Returns the tenant id or throws `ContractError("CONTEXT")` for organization/platform contexts. */
export function requireTenantId(ctx: Ctx): string {
  const scope = ctxScope(ctx);
  if (scope.kind !== "tenant") {
    throw new ContractError("CONTEXT", `This operation needs a tenant context (got ${scope.kind})`);
  }
  return scope.tenantId;
}

/** Returns the organization id or throws `ContractError("CONTEXT")`. */
export function requireOrgId(ctx: Ctx): string {
  const scope = ctxScope(ctx);
  if (scope.kind !== "org") {
    throw new ContractError(
      "CONTEXT",
      `This operation needs an organization context (got ${scope.kind})`,
    );
  }
  return scope.orgId;
}

/** Throws `ContractError("CONTEXT")` unless `ctx` is a platform context. */
export function requirePlatform(ctx: Ctx): void {
  const scope = ctxScope(ctx);
  if (scope.kind !== "platform") {
    throw new ContractError(
      "CONTEXT",
      `This operation needs a platform context (got ${scope.kind})`,
    );
  }
}

/** Anonymous = public-site visitor. Repositories only ever return public data to such a ctx. */
export function isAnonymous(ctx: Ctx): boolean {
  return ctx.actor.userId === null;
}

export const ANONYMOUS_ACTOR: Actor = Object.freeze({ userId: null, personId: null });

export function tenantCtx(tenantId: string, actor: Actor = ANONYMOUS_ACTOR): Ctx {
  return { tenantId, actor };
}

export function orgCtx(orgId: string, actor: Actor): Ctx {
  return { orgId, actor };
}

export function platformCtx(actor: Actor): Ctx {
  return { actor };
}

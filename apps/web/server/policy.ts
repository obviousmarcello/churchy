import { notFound } from "next/navigation";
import type { Ctx } from "@churchy/contracts";
import { explain } from "@churchy/policy";
import type { Action, Actor, ResourceByAction } from "@churchy/policy";
import { demoModeEnabled } from "@/lib/demo/flag";
import { devRoutesHidden } from "@/lib/dev-routes";
import { getActor, getRequestContext, type RequestContext } from "@/server/session";

/**
 * Server-side enforcement of the permission policy (D-05 [BE], SDD §11.3, §13).
 *
 * Every server action and every mutating route handler (`POST`/`PUT`/`PATCH`/`DELETE`) is built
 * with one of the wrappers below; the lint rule `policy/require-policy-wrapper`
 * (`eslint.policy.mjs`) fails on any that is not.
 *
 * - `withPolicy(action, resolveResource, handler)` — server actions;
 * - `withPolicyRoute(action, resolveResource, handler)` — route handlers.
 *
 * Both resolve the actor through the session seam (`getActor()`) and the tenant/organization of
 * the request (`getRequestContext()`), then call the **same** `can()` implementation the UI uses
 * (`explain()` from `@churchy/policy`, whose `.allowed` is `can()`). Deny by default: an unknown
 * action, a missing or foreign resource, a failing resolver or session lookup, or any case the
 * policy does not grant is refused before the handler runs.
 *
 * Denials are uniform:
 * - **404** when the actor may not learn that the resource exists — the resolver found nothing,
 *   the resource belongs to another tenant/organization, the actor belongs to another context than
 *   the request, or the wrapper is declared with `{ conceal: true }` (e.g. HR, confidential data);
 * - **403** otherwise.
 *
 * Each decision is reported to the audit sink (`setPolicyAuditSink()`); the default sink writes one
 * structured JSON line per denial. Events carry no personal data: no user/person ids, no input,
 * no resource content, no free-text policy reason (which may name ids) — see `PolicyAuditEvent`.
 *
 * Two narrow exemptions exist, each restricted to certain files by the lint rule:
 * `publicAction()` (anonymous public-site submissions, `app/(public)/**`) and `demoAction()` (demo
 * switcher and dev tools, refused outside demo mode / dev routes).
 */

/** HTTP-style status of a denial. */
export type DenialStatus = 403 | 404;

/** Why a request was denied (machine-readable; safe to log). */
export type DenialCode =
  /** The session lookup failed; treated as no capability. */
  | "session_error"
  /** The actor belongs to another tenant/organization than the request. */
  | "context_mismatch"
  /** The resource resolver threw. */
  | "resolver_error"
  /** The resource resolver found nothing. */
  | "not_found"
  /** The resource belongs to another tenant/organization than the request. */
  | "foreign_resource"
  /** `can()` refused. */
  | "policy";

/** Outcome of a wrapped server action. */
export type PolicyResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: DenialStatus };

/** What a resolver and handler receive about the current request. */
export interface PolicyScope {
  readonly actor: Actor;
  readonly context: RequestContext;
  /** Repository context (SDD §4.4) for the request's tenant/organization and actor. */
  readonly ctx: Ctx;
}

/** Scope plus the resource the policy allowed. */
export interface AuthorizedScope<A extends Action> extends PolicyScope {
  readonly resource: ResourceByAction[A];
}

export interface PolicyOptions {
  /** Answer a policy denial with 404 instead of 403 (resources the actor may not know exist). */
  readonly conceal?: boolean;
}

/** Builds the resource for `can()` from the request (and the action's arguments); `null` = 404. */
export type ResourceResolver<A extends Action, Args extends unknown[]> = (
  scope: PolicyScope,
  ...args: Args
) => ResourceByAction[A] | null | Promise<ResourceByAction[A] | null>;

// ---------------------------------------------------------------------------------------------
// Audit hook
// ---------------------------------------------------------------------------------------------

/** One policy decision. Deliberately free of personal data (CLAUDE.md privacy rules). */
export type PolicyAuditEvent =
  | {
      readonly type: "policy.denied";
      readonly action: string;
      readonly status: DenialStatus;
      readonly code: DenialCode;
      readonly actorKind: Actor["kind"] | "unknown";
      readonly tenantId: string | null;
      readonly orgId: string | null;
    }
  | {
      readonly type: "policy.allowed";
      readonly action: string;
      readonly actorKind: Actor["kind"];
      readonly tenantId: string | null;
      readonly orgId: string | null;
    };

export type PolicyAuditSink = (event: PolicyAuditEvent) => void;

/** Default sink: one structured JSON line per denial; allowed decisions are not logged. */
export const defaultPolicyAuditSink: PolicyAuditSink = (event) => {
  if (event.type === "policy.denied") console.warn(JSON.stringify(event));
};

let auditSink: PolicyAuditSink = defaultPolicyAuditSink;

/** Installs the audit sink (tests; the audit-log and observability deliverables). */
export function setPolicyAuditSink(sink: PolicyAuditSink): void {
  auditSink = sink;
}

/** Restores the default sink. */
export function resetPolicyAuditSink(): void {
  auditSink = defaultPolicyAuditSink;
}

function report(event: PolicyAuditEvent): void {
  try {
    auditSink(event);
  } catch {
    // A failing sink must never turn a denial into an error page or an allow.
  }
}

// ---------------------------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------------------------

type Authorization<A extends Action> =
  | { readonly ok: true; readonly scope: AuthorizedScope<A> }
  | { readonly ok: false; readonly status: DenialStatus };

function repositoryCtx(actor: Actor, context: RequestContext): Ctx {
  const who: Ctx["actor"] =
    actor.kind === "tenant" || actor.kind === "org"
      ? { userId: actor.userId, personId: actor.personId }
      : actor.kind === "platform"
        ? { userId: actor.userId, personId: null }
        : { userId: null, personId: null };
  return context.orgId !== undefined
    ? { orgId: context.orgId, actor: who }
    : { tenantId: context.tenantId, actor: who };
}

/** The actor's own tenant/organization differs from the request's. */
function contextMismatch(actor: Actor, context: RequestContext): boolean {
  if (actor.kind === "tenant") return actor.tenantId !== context.tenantId;
  if (actor.kind === "org") return actor.orgId !== context.orgId;
  return false;
}

/** The resource belongs to another tenant/organization than the request. */
function foreignResource(resource: object, context: RequestContext): boolean {
  const { tenantId, orgId } = resource as { tenantId?: unknown; orgId?: unknown };
  if (orgId !== undefined && orgId !== context.orgId) return true;
  // In an organization context, tenant-owned HR resources of linked parishes are legitimate;
  // the policy decides on the parish link and delegation (SDD §25.7).
  if (context.tenantId !== undefined && tenantId !== undefined && tenantId !== context.tenantId) {
    return true;
  }
  return false;
}

async function authorize<A extends Action, Args extends unknown[]>(
  action: A,
  resolveResource: ResourceResolver<A, Args>,
  options: PolicyOptions,
  args: Args,
): Promise<Authorization<A>> {
  let actor: Actor | undefined;
  let context: RequestContext | undefined;
  const deny = (status: DenialStatus, code: DenialCode): Authorization<A> => {
    report({
      type: "policy.denied",
      action,
      status,
      code,
      actorKind: actor?.kind ?? "unknown",
      tenantId: context?.tenantId ?? null,
      orgId: context?.orgId ?? null,
    });
    return { ok: false, status };
  };

  try {
    actor = await getActor();
    context = await getRequestContext();
  } catch {
    return deny(403, "session_error");
  }
  if (contextMismatch(actor, context)) return deny(404, "context_mismatch");

  const base: PolicyScope = { actor, context, ctx: repositoryCtx(actor, context) };
  let resource: ResourceByAction[A] | null;
  try {
    resource = await resolveResource(base, ...args);
  } catch {
    return deny(404, "resolver_error");
  }
  if (resource === null || typeof resource !== "object") return deny(404, "not_found");
  if (foreignResource(resource, context)) return deny(404, "foreign_resource");

  // The same policy the UI uses: `can()` is `explain().allowed`. An enricher may add context that
  // only this resource needs (the music area roles of a resource with `areaIds`).
  const effective = actorEnricher === null ? actor : await actorEnricher(actor, resource);
  if (!explain(effective, action, resource).allowed) {
    return deny(options.conceal === true ? 404 : 403, "policy");
  }

  report({
    type: "policy.allowed",
    action,
    actorKind: actor.kind,
    tenantId: context.tenantId ?? null,
    orgId: context.orgId ?? null,
  });
  return { ok: true, scope: { ...base, resource } };
}

let actorEnricher: ((actor: Actor, resource: object) => Promise<Actor>) | null = null;

/** Registers the function that adds resource-specific grants to the actor (music area roles). */
export function setPolicyActorEnricher(
  fn: (actor: Actor, resource: object) => Promise<Actor>,
): void {
  actorEnricher = fn;
}

// ---------------------------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------------------------

/**
 * Wraps a server action: the handler runs only when `can(actor, action, resource)` allows it.
 * Returns `{ ok: true, value }` or `{ ok: false, status }` (403/404); the caller shows the
 * matching message. Errors thrown by the handler itself propagate unchanged.
 */
export function withPolicy<A extends Action, Args extends unknown[], R>(
  action: A,
  resolveResource: ResourceResolver<A, Args>,
  handler: (scope: AuthorizedScope<A>, ...args: Args) => R | Promise<R>,
  options: PolicyOptions = {},
): (...args: Args) => Promise<PolicyResult<Awaited<R>>> {
  return async (...args: Args) => {
    const auth = await authorize(action, resolveResource, options, args);
    if (!auth.ok) return { ok: false, status: auth.status };
    return { ok: true, value: await handler(auth.scope, ...args) };
  };
}

/**
 * Wraps a route handler (`POST`, `PUT`, `PATCH`, `DELETE`): a denial is an empty 403/404 response
 * that is never cached.
 */
export function withPolicyRoute<A extends Action, Args extends [Request, ...unknown[]]>(
  action: A,
  resolveResource: ResourceResolver<A, Args>,
  handler: (scope: AuthorizedScope<A>, ...args: Args) => Response | Promise<Response>,
  options: PolicyOptions = {},
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const auth = await authorize(action, resolveResource, options, args);
    if (!auth.ok) {
      return new Response(null, { status: auth.status, headers: { "Cache-Control": "no-store" } });
    }
    return handler(auth.scope, ...args);
  };
}

/**
 * Exemption for anonymous public-site submissions (e.g. the *Kapcsolat* form, D-12): the policy
 * vocabulary grants anonymous visitors nothing, so these are not policy actions. They must
 * validate their input, carry their own abuse protection (honeypot; rate limit in the BE part)
 * and only write through repositories with a public (anonymous) context. Allowed only under
 * `app/(public)/` (lint).
 */
export function publicAction<Args extends unknown[], R>(
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => handler(...args);
}

/**
 * Exemption for demo and developer tools (demo switcher, *Visszaállítás*, outbox tools, D-92):
 * they act on the visitor's own in-memory demo store, never on tenant data. Refused with 404
 * unless demo mode is on or the dev routes are visible. Allowed only in `server/demo-actions.ts`
 * and under `app/fejlesztes/` (lint).
 */
export function demoAction<Args extends unknown[], R>(
  handler: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    if (!demoModeEnabled() && devRoutesHidden()) notFound();
    return handler(...args);
  };
}

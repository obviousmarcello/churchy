import type { Actor } from "@churchy/policy";

/**
 * Session / actor access (prototype) — THE single seam through which the app learns who is acting.
 *
 * Everything that needs permissions (RSC pages, nav, server helpers) calls `getActor()`; nothing
 * else may read roles or build actors (the lint rule in `eslint.permissions.mjs` exempts only
 * this file). Phase A resolves to an anonymous visitor.
 *
 * How the demo role switcher (issue #18) plugs in — pick ONE:
 *  1. Replace `defaultResolver` below with a function that reads the persona cookie via
 *     `next/headers` and returns the persona's `Actor` (built with `tenantActor()`/`orgActor()`).
 *  2. Or call `setActorResolver(fn)` once at server start-up (e.g. from the demo module) and keep
 *     this file untouched.
 * Phase B replaces the resolver with the Auth.js session + membership lookup; callers do not change.
 */
export type ActorResolver = () => Actor | Promise<Actor>;

const ANONYMOUS: Actor = { kind: "anonymous" };

const defaultResolver: ActorResolver = () => ANONYMOUS;

let resolver: ActorResolver = defaultResolver;

/** Installs the resolver used by `getActor()` (see the seam notes above). */
export function setActorResolver(next: ActorResolver): void {
  resolver = next;
}

/** Restores the default (anonymous) resolver; used by tests. */
export function resetActorResolver(): void {
  resolver = defaultResolver;
}

/** The actor of the current request. Anonymous unless a resolver says otherwise. */
export async function getActor(): Promise<Actor> {
  return resolver();
}

/**
 * Tenant (church) context of the current request. Stub for Phase A: the demo tenants and host
 * resolution arrive with D-91/D-02.
 */
export interface RequestContext {
  readonly tenantId: string;
}

export async function getRequestContext(): Promise<RequestContext> {
  return { tenantId: "demo-tenant" };
}

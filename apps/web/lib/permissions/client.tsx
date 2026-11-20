"use client";

import { createContext, useContext, type ReactNode } from "react";
import { can } from "@churchy/policy";
import type { Action, Actor, ResourceByAction } from "@churchy/policy";

const ActorContext = createContext<Actor | null>(null);

export interface PermissionsProviderProps {
  /** The serialisable actor from the server (`getActor()`); the same pure `can()` runs here. */
  actor: Actor;
  children: ReactNode;
}

/** Makes the actor available to `useCan()` / `<Can>` in client components. */
export function PermissionsProvider({ actor, children }: PermissionsProviderProps) {
  return <ActorContext.Provider value={actor}>{children}</ActorContext.Provider>;
}

/** Decides with the real policy; without a provider everything is denied (deny by default). */
export function useCan<A extends Action>(action: A, resource: ResourceByAction[A]): boolean {
  const actor = useContext(ActorContext);
  return actor === null ? false : can(actor, action, resource);
}

export type CanProps<A extends Action> = {
  action: A;
  resource: ResourceByAction[A];
  /** Rendered when the action is denied (default: nothing). */
  fallback?: ReactNode;
  children: ReactNode;
};

/** Renders `children` only if the actor may perform `action` on `resource`. */
export function Can<A extends Action>({
  action,
  resource,
  fallback = null,
  children,
}: CanProps<A>) {
  return useCan(action, resource) ? <>{children}</> : <>{fallback}</>;
}

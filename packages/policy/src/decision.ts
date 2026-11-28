/** The outcome of a policy check, with a human-readable (English) reason for tests and dev tools. */
export interface Decision {
  readonly allowed: boolean;
  readonly reason: string;
}

export const allow = (reason: string): Decision => ({ allowed: true, reason });
export const deny = (reason: string): Decision => ({ allowed: false, reason });

/** A matrix row: one capability of the SDD, the actions it maps to and the grant per role. */
export interface MatrixRow<A extends string, R extends string, G extends string> {
  readonly capability: string;
  readonly actions: readonly A[];
  readonly grants: Partial<Record<R, G>>;
}

/** Indexes matrix rows by action. */
export function indexRows<A extends string, R extends string, G extends string>(
  rows: readonly MatrixRow<A, R, G>[],
): ReadonlyMap<string, MatrixRow<A, R, G>> {
  const byAction = new Map<string, MatrixRow<A, R, G>>();
  for (const row of rows) for (const action of row.actions) byAction.set(action, row);
  return byAction;
}

/**
 * Evaluates a matrix row additively: the first role (in `roleOrder`) the actor holds whose grant
 * passes allows the action. Denials report the scope checks that failed.
 */
export function evaluateRow<R extends string, G extends string>(
  row: { readonly grants: Partial<Record<R, G>> },
  roleOrder: readonly R[],
  heldRoles: readonly string[],
  action: string,
  check: (grant: G, role: R) => string | null,
): Decision {
  const failures: string[] = [];
  for (const role of roleOrder) {
    const grant = row.grants[role];
    if (grant === undefined || !heldRoles.includes(role)) continue;
    const failure = check(grant, role);
    if (failure === null) {
      return allow(
        grant === "all" ? `${role} grants ${action}` : `${role} grants ${action} (${grant})`,
      );
    }
    failures.push(`${role}: ${failure}`);
  }
  return deny(failures.length > 0 ? failures.join("; ") : `no role of the actor grants ${action}`);
}

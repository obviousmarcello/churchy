/** Deep-partial view of a config layer: every nested property optional, arrays whole. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

function mergeTwo(base: unknown, layer: unknown): unknown {
  if (layer === undefined) return clone(base);
  if (isPlainObject(base) && isPlainObject(layer)) {
    const out: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(layer)])) {
      const merged = mergeTwo(base[key], layer[key]);
      if (merged !== undefined) out[key] = merged;
    }
    return out;
  }
  return clone(layer);
}

/**
 * Merges configuration layers left to right (SDD §5.1):
 * `deepMerge(platformDefaults, preset, tenantOverrides)`.
 *
 * - Plain objects merge key by key, recursively.
 * - Arrays and scalars of a later layer **replace** the earlier value (a stored navigation is
 *   the whole navigation, not a patch).
 * - `undefined` (or a missing key) means "no override": removing an override from the stored
 *   overrides therefore restores the value of the layer below. `null` is a real value.
 * - Inputs are never mutated; the result shares no objects with them.
 */
export function deepMerge<T>(base: T, ...layers: (DeepPartial<T> | undefined)[]): T {
  return layers.reduce<unknown>((acc, layer) => mergeTwo(acc, layer), clone(base)) as T;
}

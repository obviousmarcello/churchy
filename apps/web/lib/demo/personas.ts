import { z } from "zod";

/**
 * Demo personas and the demo selection (D-92). Pure and client-safe: the persona list, the
 * selection (persona + church/diocese context) and how one change adjusts the other.
 *
 * A persona is only a key; what it may do is decided by `can()` with the actor that
 * `server/session.ts` builds from the persona's demo membership (never by the key itself).
 */

/** Where a persona acts: the public website, a church (tenant) or the diocese (organization). */
export type PersonaScope = "public" | "tenant" | "org";

export const DEMO_PERSONAS = [
  { key: "latogato", scope: "public" },
  { key: "tulajdonos", scope: "tenant" },
  { key: "szerkeszto", scope: "tenant" },
  { key: "iroda", scope: "tenant" },
  { key: "vezeto", scope: "tenant" },
  { key: "onkentes", scope: "tenant" },
  { key: "zenei", scope: "tenant" },
  { key: "terem", scope: "tenant" },
  { key: "hr", scope: "tenant" },
  { key: "bizalmas", scope: "tenant" },
  { key: "egyhazmegyeiHr", scope: "org" },
] as const satisfies readonly { key: string; scope: PersonaScope }[];

export type DemoPersonaKey = (typeof DEMO_PERSONAS)[number]["key"];

export const DEMO_PERSONA_KEYS = DEMO_PERSONAS.map((p) => p.key) as [
  DemoPersonaKey,
  ...DemoPersonaKey[],
];

export const DemoPersonaKeySchema = z.enum(DEMO_PERSONA_KEYS);

export function personaScope(key: DemoPersonaKey): PersonaScope {
  return DEMO_PERSONAS.find((p) => p.key === key)!.scope;
}

/** The persona a new demo visitor starts as. */
export const DEFAULT_PERSONA: DemoPersonaKey = "latogato";
/** The persona used when the visitor switches to the diocese context. */
export const ORG_PERSONA: DemoPersonaKey = "egyhazmegyeiHr";

/** A selectable demo context: one of the demo churches or the diocese portal. */
export interface DemoContextOption {
  readonly kind: "tenant" | "org";
  readonly id: string;
  /** Display name from the demo data (not a UI string). */
  readonly name: string;
}

/** The known contexts, in switcher order; the first tenant is the default. */
export interface DemoDirectory {
  readonly contexts: readonly DemoContextOption[];
  readonly defaultTenantId: string;
}

export interface DemoSelection {
  readonly persona: DemoPersonaKey;
  /** Id of a tenant or of the organization from the directory. */
  readonly contextId: string;
}

export function defaultSelection(directory: DemoDirectory): DemoSelection {
  return { persona: DEFAULT_PERSONA, contextId: directory.defaultTenantId };
}

export function contextOf(directory: DemoDirectory, contextId: string): DemoContextOption {
  const hit = directory.contexts.find((c) => c.id === contextId);
  if (!hit) throw new RangeError(`Unknown demo context: ${contextId}`);
  return hit;
}

function firstOrgId(directory: DemoDirectory): string | undefined {
  return directory.contexts.find((c) => c.kind === "org")?.id;
}

/** Zod schema of a selection whose context must be one of `directory`'s. */
export function demoSelectionSchema(directory: DemoDirectory) {
  const ids = directory.contexts.map((c) => c.id) as [string, ...string[]];
  return z.object({ persona: DemoPersonaKeySchema, contextId: z.enum(ids) }).strict();
}

/**
 * Makes persona and context fit together, keeping the field the visitor just changed:
 * a diocesan persona acts in the diocese, church personas act in a church, and the visitor
 * (*Látogató*) can look at either.
 */
function reconcile(
  directory: DemoDirectory,
  selection: DemoSelection,
  keep: "persona" | "context",
): DemoSelection {
  const scope = personaScope(selection.persona);
  const kind = contextOf(directory, selection.contextId).kind;
  if (scope === "public" || scope === kind) return selection;
  if (keep === "persona") {
    const contextId =
      scope === "org"
        ? (firstOrgId(directory) ?? directory.defaultTenantId)
        : directory.defaultTenantId;
    return { ...selection, contextId };
  }
  return { ...selection, persona: kind === "org" ? ORG_PERSONA : DEFAULT_PERSONA };
}

/** The selection after the visitor picks `persona` (≤ 2 clicks: open the list, pick one). */
export function selectPersona(
  directory: DemoDirectory,
  current: DemoSelection,
  persona: DemoPersonaKey,
): DemoSelection {
  return reconcile(directory, { ...current, persona }, "persona");
}

/** The selection after the visitor picks a church or the diocese. */
export function selectContext(
  directory: DemoDirectory,
  current: DemoSelection,
  contextId: string,
): DemoSelection {
  contextOf(directory, contextId);
  return reconcile(directory, { ...current, contextId }, "context");
}

/** Cookie value of a selection. */
export function encodeSelection(selection: DemoSelection): string {
  return encodeURIComponent(JSON.stringify(selection));
}

/**
 * Selection from a cookie value; anything missing, malformed, unknown or inconsistent falls back
 * to the default selection (the cookie is visitor-controlled input).
 */
export function decodeSelection(directory: DemoDirectory, raw: string | undefined): DemoSelection {
  if (raw === undefined || raw === "") return defaultSelection(directory);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return defaultSelection(directory);
  }
  const result = demoSelectionSchema(directory).safeParse(parsed);
  if (!result.success) return defaultSelection(directory);
  return reconcile(directory, result.data, "persona");
}

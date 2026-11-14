"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { termsForSiteConfig } from "@/i18n/terms";
import { DemoPersonaKeySchema, selectContext, selectPersona } from "@/lib/demo/personas";
import { TERM_ROUTE_HEADER, isTermRouteKey, termRoutePath } from "@/lib/term-routes";
import { resetDemoSession } from "@/server/data-adapters";
import { getDemoState, saveDemoSelection, type DemoState } from "@/server/demo";
import { repositoriesForDemo } from "@/server/repositories";
import { requestContextFrom } from "@/server/session";
import { resolveSiteConfig } from "@/server/site-config";

/**
 * Demo switcher actions (D-92). Every input is validated with Zod against the known personas and
 * contexts; outside demo mode the actions do not exist (404).
 */

async function requireDemo(): Promise<DemoState> {
  const demo = await getDemoState();
  if (demo === null) notFound();
  return demo;
}

/** Switches the demo persona (form field `persona`). */
export async function switchPersona(formData: FormData): Promise<void> {
  const demo = await requireDemo();
  const persona = DemoPersonaKeySchema.safeParse(formData.get("persona"));
  if (!persona.success) return;
  await saveDemoSelection(selectPersona(demo.directory, demo.selection, persona.data));
  revalidatePath("/", "layout");
}

/** Switches between the demo churches and the diocese (form field `context`). */
export async function switchContext(formData: FormData): Promise<void> {
  const demo = await requireDemo();
  const ids = demo.directory.contexts.map((c) => c.id) as [string, ...string[]];
  const contextId = z.enum(ids).safeParse(formData.get("context"));
  if (!contextId.success) return;
  const selection = selectContext(demo.directory, demo.selection, contextId.data);
  await saveDemoSelection(selection);
  revalidatePath("/", "layout");
  // On a term route (`/miserend`) the old church's slug is a 404 for the new one: go to the new
  // church's slug for the same page (`/istentiszteleti-rend`); the diocese has no public site.
  const termRoute = (await headers()).get(TERM_ROUTE_HEADER);
  if (isTermRouteKey(termRoute)) {
    const next = { ...demo, selection };
    const config = await resolveSiteConfig(repositoriesForDemo(next), requestContextFrom(next));
    redirect(config.tenantId === null ? "/" : termRoutePath(termsForSiteConfig(config), termRoute));
  }
}

export interface ResetResult {
  readonly status: "idle" | "done" | "failed";
  /** Changes on every successful reset, so the status message is announced again. */
  readonly count: number;
}

/** *Visszaállítás*: restores the visitor's demo data to the seed (any persona may do this). */
export async function resetDemo(previous: ResetResult): Promise<ResetResult> {
  const demo = await requireDemo();
  if (demo.sessionId === null) return { status: "failed", count: previous.count };
  resetDemoSession(demo.sessionId);
  revalidatePath("/", "layout");
  return { status: "done", count: previous.count + 1 };
}

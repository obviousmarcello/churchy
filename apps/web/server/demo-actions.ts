"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { termsForSiteConfig } from "@/i18n/terms";
import { looksLikeEmail } from "@/lib/demo/accounts";
import { DemoPersonaKeySchema, contextOf, selectContext, selectPersona } from "@/lib/demo/personas";
import { SITE_BASE_HEADER, demoSiteBase, siteHref } from "@/lib/site-base";
import { TERM_ROUTE_HEADER, isTermRouteKey, termRoutePath } from "@/lib/term-routes";
import { getAuthProvider } from "@/server/auth";
import { resetDemoSession } from "@/server/data-adapters";
import { getDemoState, saveDemoSelection, type DemoState } from "@/server/demo";
import { repositoriesForDemo } from "@/server/repositories";
import { demoAction } from "@/server/policy";
import { requestContextFrom } from "@/server/session";
import { resolveSiteConfig } from "@/server/site-config";

/**
 * Demo switcher actions (D-92). Every input is validated with Zod against the known personas and
 * contexts; outside demo mode the actions do not exist (404). They change only the visitor's own
 * demo store and cookies, so they are `demoAction()` exemptions of the policy wrapper (D-05).
 */

async function requireDemo(): Promise<DemoState> {
  const demo = await getDemoState();
  if (demo === null) notFound();
  return demo;
}

/** Switches the demo persona (form field `persona`). */
export const switchPersona = demoAction(async (formData: FormData): Promise<void> => {
  const demo = await requireDemo();
  const persona = DemoPersonaKeySchema.safeParse(formData.get("persona"));
  if (!persona.success) return;
  const selection = selectPersona(demo.directory, demo.selection, persona.data);
  await saveDemoSelection(selection);
  revalidatePath("/", "layout");
  // A church's demo site shows the church in its URL: a diocesan persona goes to the portal.
  const siteBase = (await headers()).get(SITE_BASE_HEADER);
  if (siteBase && contextOf(demo.directory, selection.contextId).kind === "org") {
    redirect("/egyhazmegye");
  }
});

/** Switches between the demo churches and the diocese (form field `context`). */
export const switchContext = demoAction(async (formData: FormData): Promise<void> => {
  const demo = await requireDemo();
  const ids = demo.directory.contexts.map((c) => c.id) as [string, ...string[]];
  const contextId = z.enum(ids).safeParse(formData.get("context"));
  if (!contextId.success) return;
  const selection = selectContext(demo.directory, demo.selection, contextId.data);
  await saveDemoSelection(selection);
  revalidatePath("/", "layout");
  const requestHeaders = await headers();
  const siteBase = requestHeaders.get(SITE_BASE_HEADER);
  const termRoute = requestHeaders.get(TERM_ROUTE_HEADER);
  const next = { ...demo, selection };
  const target = contextOf(demo.directory, selection.contextId);
  if (siteBase !== null && siteBase !== "") {
    // On a church's own demo site (`/demo/<slug>`) the church is in the URL: follow the switch to
    // the other church's site (the same page when it is a term route), or to the diocese portal.
    if (target.kind === "org" || target.slug === undefined) redirect("/egyhazmegye");
    const base = demoSiteBase(target.slug);
    if (isTermRouteKey(termRoute)) {
      const config = await resolveSiteConfig(repositoriesForDemo(next), requestContextFrom(next));
      redirect(siteHref(base, termRoutePath(termsForSiteConfig(config), termRoute)));
    }
    redirect(base);
  }
  // On a term route (`/miserend`) the old church's slug is a 404 for the new one: go to the new
  // church's slug for the same page (`/istentiszteleti-rend`); the diocese has no public site.
  if (isTermRouteKey(termRoute)) {
    const config = await resolveSiteConfig(repositoriesForDemo(next), requestContextFrom(next));
    redirect(config.tenantId === null ? "/" : termRoutePath(termsForSiteConfig(config), termRoute));
  }
});

export interface ResetResult {
  readonly status: "idle" | "done" | "failed";
  /** Changes on every successful reset, so the status message is announced again. */
  readonly count: number;
}

/** *Visszaállítás*: restores the visitor's demo data to the seed (any persona may do this). */
export const resetDemo = demoAction(async (previous: ResetResult): Promise<ResetResult> => {
  const demo = await requireDemo();
  if (demo.sessionId === null) return { status: "failed", count: previous.count };
  resetDemoSession(demo.sessionId);
  revalidatePath("/", "layout");
  return { status: "done", count: previous.count + 1 };
});

/** What the login form shows after a submit (`/belepes`). */
export interface SignInState {
  readonly status: "idle" | "error" | "link-sent" | "forgot" | "unavailable";
  /** Which message of `public.login.errors` to show, for `status: "error"`. */
  readonly error?: "emailRequired" | "emailInvalid" | "passwordRequired" | "invalid" | "generic";
  /** The address as typed, so the form keeps it. */
  readonly email: string;
}

const ChurchSlug = z.string().regex(/^[a-z0-9-]{1,80}$/);

/**
 * The login form (`/belepes`): password sign-in, magic link or the forgotten-password stub, by
 * the submit button's `intent`. The identity provider is behind `getAuthProvider()` (the mock until
 * Supabase Auth); a successful sign-in redirects to the person's area. It is a `demoAction()`
 * because the only provider today is the demo's: no tenant data is touched, and outside demo mode
 * the form says so instead of failing.
 */
export const signIn = demoAction(
  async (_previous: SignInState, formData: FormData): Promise<SignInState> => {
    const provider = getAuthProvider();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const intent = String(formData.get("intent") ?? "password");
    if (!provider.available()) return { status: "unavailable", email };
    if (intent === "forgot") return { status: "forgot", email };

    if (email === "") return { status: "error", error: "emailRequired", email };
    if (!looksLikeEmail(email)) return { status: "error", error: "emailInvalid", email };

    if (intent === "link") {
      const result = await provider.requestMagicLink(email);
      return result.ok ? { status: "link-sent", email } : { status: "unavailable", email };
    }

    if (password === "") return { status: "error", error: "passwordRequired", email };
    const church = ChurchSlug.safeParse(formData.get("church"));
    const result = await provider.signIn({
      email,
      password,
      churchSlug: church.success ? church.data : undefined,
    });
    if (!result.ok) {
      return result.reason === "unavailable"
        ? { status: "unavailable", email }
        : { status: "error", error: "invalid", email };
    }
    revalidatePath("/", "layout");
    redirect(result.destination);
  },
);

/** *Kilépés* in the admin and workspace frames: a visitor again, back on the landing page. */
export const signOut = demoAction(async (): Promise<void> => {
  await getAuthProvider().signOut();
  revalidatePath("/", "layout");
  redirect("/");
});

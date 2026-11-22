import { can, type Actor } from "@churchy/policy";
import { demoDirectory, demoIdentity } from "@/server/data-adapters";
import { demoModeEnabled } from "@/lib/demo/flag";
import { HOME_PATH, demoAccountByEmail, type AccountHome } from "@/lib/demo/accounts";
import { DEFAULT_PERSONA, selectContext, selectPersona } from "@/lib/demo/personas";
import { getDemoState, saveDemoSelection } from "@/server/demo";
import { actorFromIdentity } from "@/server/session";

/**
 * Sign-in seam (SDD §10, Phase B): everything the login page and the *Kilépés* actions need from
 * an identity provider goes through {@link AuthProvider}. Today the only implementation is the mock
 * below (demo mode: the fictitious accounts of `lib/demo/accounts.ts`); Supabase Auth (magic link,
 * password, TOTP) replaces it by returning another provider from {@link getAuthProvider}. The
 * login page and the actions do not change.
 *
 * What a provider does NOT decide is what the signed-in person may do: that stays with `can()` and
 * the actor `server/session.ts` builds.
 */

export interface SignInInput {
  readonly email: string;
  readonly password: string;
  /** Slug of the church the person signed in from (`/belepes?egyhaz=…`), when known. */
  readonly churchSlug?: string | undefined;
}

export type SignInResult =
  /** Signed in; `destination` is the area to open first (an internal path). */
  | { readonly ok: true; readonly destination: string }
  /** Unknown address or wrong password (never says which). */
  | { readonly ok: false; readonly reason: "invalid_credentials" }
  /** No identity provider is available on this deployment. */
  | { readonly ok: false; readonly reason: "unavailable" };

export type MagicLinkResult =
  /** A link was sent, or would have been: the answer is the same for unknown addresses. */
  { readonly ok: true } | { readonly ok: false; readonly reason: "unavailable" };

export interface AuthProvider {
  /** Whether this provider can sign people in at all on this deployment. */
  available(): boolean;
  signIn(input: SignInInput): Promise<SignInResult>;
  /** Mails a one-time sign-in link. Never reveals whether the address exists. */
  requestMagicLink(email: string): Promise<MagicLinkResult>;
  /** Ends the session: the person is a visitor again. */
  signOut(): Promise<void>;
}

/** The area a person lands in after signing in: their account's home, if `can()` allows it. */
function destinationFor(actor: Actor, home: AccountHome): string {
  const tenant = actor.kind === "tenant" ? { tenantId: actor.tenantId } : null;
  const canAdmin = tenant !== null && can(actor, "news.create", tenant);
  const canWorkspace = tenant !== null && can(actor, "directory.open", tenant);
  const canDiocese = actor.kind === "org" && can(actor, "org.portal.open", { orgId: actor.orgId });
  const allowed: Record<AccountHome, boolean> = {
    admin: canAdmin,
    workspace: canWorkspace,
    diocese: canDiocese,
  };
  if (allowed[home]) return HOME_PATH[home];
  const fallback = (["workspace", "admin", "diocese"] as const).find((area) => allowed[area]);
  return fallback ? HOME_PATH[fallback] : "/";
}

/**
 * The mock provider (demo mode only): the fictitious demo accounts with any non-empty password.
 * Signing in sets the demo persona (and the church, when the person came from one), exactly like
 * the demo switcher does, so the app then sees a real actor built from the demo data.
 */
const mockAuthProvider: AuthProvider = {
  available: () => demoModeEnabled(),

  async signIn({ email, password, churchSlug }) {
    const demo = await getDemoState();
    if (demo === null) return { ok: false, reason: "unavailable" };
    const account = demoAccountByEmail(email);
    if (account === null || password.trim() === "")
      return { ok: false, reason: "invalid_credentials" };

    const directory = demoDirectory();
    let selection = demo.selection;
    const church = directory.contexts.find((c) => c.kind === "tenant" && c.slug === churchSlug);
    if (church) selection = selectContext(directory, selection, church.id);
    selection = selectPersona(directory, selection, account.persona);
    await saveDemoSelection(selection);

    const actor = actorFromIdentity(
      demoIdentity(demo.sessionId, selection.persona, selection.contextId),
    );
    return { ok: true, destination: destinationFor(actor, account.home) };
  },

  async requestMagicLink() {
    // Demo: no mail goes out (the outbox of the demo holds app notifications only).
    return demoModeEnabled() ? { ok: true } : { ok: false, reason: "unavailable" };
  },

  async signOut() {
    const demo = await getDemoState();
    if (demo === null) return;
    await saveDemoSelection(selectPersona(demo.directory, demo.selection, DEFAULT_PERSONA));
  },
};

/** The identity provider of this deployment (the mock until Supabase Auth, SDD §10). */
export function getAuthProvider(): AuthProvider {
  return mockAuthProvider;
}

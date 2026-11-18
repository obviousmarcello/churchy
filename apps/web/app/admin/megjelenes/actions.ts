"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  HomeSectionSchema,
  NavItemSchema,
  SiteIdentitySchema,
  SiteThemeSchema,
  type SiteConfigOverrides,
} from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import { canSaveBranding, checkColors } from "@/lib/appearance/branding";
import { homeProblems, sectionAllowed } from "@/lib/appearance/home-composer";
import { linkListIssues, navigationIssues } from "@/lib/appearance/navigation-editor";
import { withPolicy, type AuthorizedScope, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Appearance mutations (D-24): branding and theme, home composer, navigation and footer. Each
 * goes through the policy wrapper (`site.appearance.edit` / `site.navigation.edit`), is validated
 * again here (the editor's checks are a convenience, not the guard) and replaces one section of
 * the tenant's stored `siteConfig` overrides. Changes show on the public site on the next request.
 */

export type SaveResult =
  | { ok: true }
  | { ok: false; error: "invalid" }
  | { ok: false; error: "contrast"; suggestion: string };

/** The request's church as the policy resource; `null` (404) outside a church context. */
const tenantResource = ({ context }: PolicyScope) =>
  context.tenantId === undefined ? null : { tenantId: context.tenantId };

async function patchSiteConfig(
  scope: AuthorizedScope<"site.appearance.edit" | "site.navigation.edit">,
  patch: (current: SiteConfigOverrides) => SiteConfigOverrides,
): Promise<void> {
  const { tenants } = await getRequestRepositories();
  const tenant = await tenants.current(scope.ctx);
  if (tenant === null) throw new Error("No tenant");
  await tenants.updateSiteConfig(scope.ctx, patch(tenant.siteConfig));
  revalidatePath("/", "layout");
}

const BrandingInput = z.object({
  identity: SiteIdentitySchema.pick({ name: true, shortName: true, tagline: true }),
  theme: SiteThemeSchema,
});
export type BrandingInput = z.input<typeof BrandingInput>;

/** Name, tagline, colours (4.5:1 enforced), theme, fonts, hero style and corner radius. */
export const saveBranding = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _input: BrandingInput) => tenantResource(scope),
  async (scope, input): Promise<SaveResult> => {
    const parsed = BrandingInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { identity, theme } = parsed.data;
    if (!canSaveBranding(theme)) {
      const { primary } = checkColors(theme);
      return primary.ok || primary.reason !== "contrast"
        ? { ok: false, error: "invalid" }
        : { ok: false, error: "contrast", suggestion: primary.suggestion };
    }
    await patchSiteConfig(scope, (current) => ({
      ...current,
      identity: {
        ...current.identity,
        name: identity.name,
        shortName: identity.shortName,
        ...(identity.tagline ? { tagline: identity.tagline } : { tagline: undefined }),
      },
      theme: {
        ...theme,
        colors: { ...theme.colors, primary: theme.colors.primary.toLowerCase() },
      },
    }));
    return { ok: true };
  },
);

const HomeInput = z.array(HomeSectionSchema).max(30);

/** The ordered list of home sections with their settings. */
export const saveHome = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _input: z.input<typeof HomeInput>) => tenantResource(scope),
  async (scope, input): Promise<SaveResult> => {
    const parsed = HomeInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const sections = parsed.data;
    const ids = new Set(sections.map((s) => s.id));
    if (ids.size !== sections.length || Object.keys(homeProblems(sections)).length > 0) {
      return { ok: false, error: "invalid" };
    }
    const { tenants } = await getRequestRepositories();
    const tenant = await tenants.current(scope.ctx);
    if (tenant === null) return { ok: false, error: "invalid" };
    const { modules } = effectiveConfig({
      name: tenant.name,
      denomination: tenant.denomination,
      siteConfig: tenant.siteConfig,
    });
    if (!sections.every((s) => sectionAllowed(s.type, modules))) {
      return { ok: false, error: "invalid" };
    }
    await patchSiteConfig(scope, (current) => ({ ...current, home: sections }));
    return { ok: true };
  },
);

const NavigationInput = z.array(NavItemSchema).max(12);

/** The main navigation: labels, order, two levels, external links (`site.navigation.edit`). */
export const saveNavigation = withPolicy(
  "site.navigation.edit",
  (scope: PolicyScope, _input: z.input<typeof NavigationInput>) => tenantResource(scope),
  async (scope, input): Promise<SaveResult> => {
    const parsed = NavigationInput.safeParse(input);
    if (!parsed.success || navigationIssues(parsed.data).length > 0) {
      return { ok: false, error: "invalid" };
    }
    await patchSiteConfig(scope, (current) => ({ ...current, navigation: parsed.data }));
    return { ok: true };
  },
);

const FooterInput = z.object({
  showMap: z.boolean(),
  links: z.array(NavItemSchema.omit({ children: true })).max(12),
  dioceseLink: z.object({ label: z.string().trim().min(1).max(500), url: z.url() }).nullable(),
});

/** Footer links and the diocese link. */
export const saveFooter = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _input: z.input<typeof FooterInput>) => tenantResource(scope),
  async (scope, input): Promise<SaveResult> => {
    const parsed = FooterInput.safeParse(input);
    if (!parsed.success || linkListIssues(parsed.data.links).length > 0) {
      return { ok: false, error: "invalid" };
    }
    const { dioceseLink, ...footer } = parsed.data;
    await patchSiteConfig(scope, (current) => ({
      ...current,
      footer: { ...current.footer, ...footer, dioceseLink: dioceseLink ?? undefined },
    }));
    return { ok: true };
  },
);

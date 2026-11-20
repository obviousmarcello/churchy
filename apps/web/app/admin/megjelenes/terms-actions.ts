"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DenominationSchema,
  TermFormsSchema,
  type Denomination,
  type SiteConfigOverrides,
  type TermForms,
} from "@churchy/contracts";
import {
  TERM_KEYS,
  configDiff,
  effectiveConfig,
  presetDiff,
  type PathRedirect,
} from "@churchy/presets";
import { SLUG_RE, termProblem } from "@/lib/appearance/terms-editor";
import { withPolicy, type AuthorizedScope, type PolicyScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/**
 * Terminology and denomination mutations (D-23): a term override, its removal and the change of
 * the denomination preset. Each goes through the policy wrapper (`site.appearance.edit`), is
 * validated again here and stores a 301 redirect for every public path the change moves (old term
 * slugs, old rite pages), so old links and search results keep working (FR-102).
 */

export type TermsResult =
  { ok: true; redirects: PathRedirect[] } | { ok: false; error: "invalid" | "slugTaken" };

const tenantResource = ({ context }: PolicyScope) =>
  context.tenantId === undefined ? null : { tenantId: context.tenantId };

type Scope = AuthorizedScope<"site.appearance.edit">;

async function currentTenant(scope: Scope) {
  const { tenants } = await getRequestRepositories();
  const tenant = await tenants.current(scope.ctx);
  if (tenant === null) throw new Error("No tenant");
  return { tenants, tenant };
}

const sourceOf = (tenant: {
  name: string;
  denomination: Denomination;
  siteConfig: SiteConfigOverrides;
}) => ({
  name: tenant.name,
  denomination: tenant.denomination,
  siteConfig: tenant.siteConfig,
});

/** Stores the redirects of a change; a redirect never points at itself or at a path in use. */
async function storeRedirects(scope: Scope, redirects: readonly PathRedirect[]) {
  const { tenants } = await getRequestRepositories();
  for (const { fromPath, toPath } of redirects) {
    if (fromPath === toPath) continue;
    await tenants.upsertRedirect(scope.ctx, { fromPath, toPath, code: 301 });
  }
}

const TermKeyInput = z.enum(TERM_KEYS);

/** Overrides one term (replaces its forms as a whole). */
export const saveTerm = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _key: string, _forms: TermForms) => tenantResource(scope),
  async (scope, key, forms): Promise<TermsResult> => {
    const parsedKey = TermKeyInput.safeParse(key);
    const parsedForms = TermFormsSchema.safeParse(forms);
    if (!parsedKey.success || !parsedForms.success || !SLUG_RE.test(parsedForms.data.slug)) {
      return { ok: false, error: "invalid" };
    }
    const { tenants, tenant } = await currentTenant(scope);
    const before = effectiveConfig(sourceOf(tenant));
    const others = Object.fromEntries(
      Object.entries(before.terminology)
        .filter(([k]) => k !== parsedKey.data)
        .map(([k, f]) => [f.slug, k]),
    );
    if (
      termProblem(
        {
          nom: parsedForms.data.nom,
          plural: "",
          slug: parsedForms.data.slug,
          article: parsedForms.data.article,
        },
        others,
      ) === "slugTaken"
    ) {
      return { ok: false, error: "slugTaken" };
    }
    const siteConfig = {
      ...tenant.siteConfig,
      terminology: { ...tenant.siteConfig.terminology, [parsedKey.data]: parsedForms.data },
    };
    const after = effectiveConfig({ ...sourceOf(tenant), siteConfig });
    await tenants.updateSiteConfig(scope.ctx, siteConfig);
    const { redirects } = configDiff(before, after);
    await storeRedirects(scope, redirects);
    revalidatePath("/", "layout");
    return { ok: true, redirects };
  },
);

/** Removes a term override: the preset's wording is back. */
export const resetTerm = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _key: string) => tenantResource(scope),
  async (scope, key): Promise<TermsResult> => {
    const parsedKey = TermKeyInput.safeParse(key);
    if (!parsedKey.success) return { ok: false, error: "invalid" };
    const { tenants, tenant } = await currentTenant(scope);
    const before = effectiveConfig(sourceOf(tenant));
    const { [parsedKey.data]: _removed, ...rest } = tenant.siteConfig.terminology ?? {};
    const siteConfig = { ...tenant.siteConfig, terminology: rest };
    const after = effectiveConfig({ ...sourceOf(tenant), siteConfig });
    await tenants.updateSiteConfig(scope.ctx, siteConfig);
    const { redirects } = configDiff(before, after);
    await storeRedirects(scope, redirects);
    revalidatePath("/", "layout");
    return { ok: true, redirects };
  },
);

/**
 * Switches the denomination preset. The church's own overrides stay; the preview the editor showed
 * is recomputed here (`presetDiff`), so the stored redirects are those of the change that happens.
 */
export const changeDenomination = withPolicy(
  "site.appearance.edit",
  (scope: PolicyScope, _to: Denomination) => tenantResource(scope),
  async (scope, to): Promise<TermsResult> => {
    const parsed = DenominationSchema.safeParse(to);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const { tenants, tenant } = await currentTenant(scope);
    if (parsed.data === tenant.denomination) return { ok: true, redirects: [] };
    const diff = presetDiff(tenant.denomination, parsed.data, tenant.siteConfig);
    await tenants.update(scope.ctx, { denomination: parsed.data });
    await storeRedirects(scope, diff.redirects);
    revalidatePath("/", "layout");
    return { ok: true, redirects: diff.redirects };
  },
);

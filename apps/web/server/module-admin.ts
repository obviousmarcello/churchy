import { redirect } from "next/navigation";
import { getT } from "@/i18n/server";
import { formValues, type FieldDef, type FormState } from "@/lib/admin/content-form";
import {
  WEBSITE_MODULE_KEYS,
  WORKSPACE_MODULE_KEYS,
  applyModuleToggles,
  websiteField,
  websiteModuleRows,
  workspaceField,
  workspaceModuleId,
  workspaceModuleRows,
  type ModuleRow,
} from "@/lib/plans/modules";
import type { ModuleKey, WorkspaceModuleKey } from "@churchy/contracts";
import { effectiveConfig } from "@churchy/presets";
import { adminData } from "@/server/content-admin";
import { entitlementsFor } from "@/server/plans";
import type { AuthorizedScope } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";

/** Module toggles (D-25): the data of the screen and the save. */

const FIELD_NAMES = [
  ...WEBSITE_MODULE_KEYS.map(websiteField),
  ...WORKSPACE_MODULE_KEYS.map(workspaceField),
];

export interface ModulesView {
  website: ModuleRow<ModuleKey>[];
  workspace: ModuleRow<WorkspaceModuleKey>[];
  fields: FieldDef[];
  values: Record<string, string>;
}

/** The toggles screen: entitled modules as checkboxes, the rest as locked rows. */
export async function getModulesView(): Promise<ModulesView | null> {
  const { ctx, repos } = await adminData();
  const tenant = await repos.tenants.current(ctx);
  if (tenant === null) return null;
  const [ent, t] = await Promise.all([entitlementsFor(ctx), getT("admin.modules")]);
  const config = effectiveConfig({
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  });
  const website = websiteModuleRows(config.modules, ent);
  const workspace = workspaceModuleRows(ent.wsTier, tenant.siteConfig.workspaceModules, ent);
  const values: Record<string, string> = {};
  const fields: FieldDef[] = [];
  const websiteOn = website.filter((r) => r.entitled);
  if (websiteOn.length > 0) {
    fields.push({ name: "h_website", label: t("website.title"), kind: "heading" });
    for (const r of websiteOn) {
      fields.push({
        name: websiteField(r.key),
        label: t(`website.items.${r.key}.title`),
        help: t(`website.items.${r.key}.help`),
        kind: "checkbox",
      });
      values[websiteField(r.key)] = r.enabled ? "on" : "";
    }
  }
  const workspaceOn = workspace.filter((r) => r.entitled);
  if (workspaceOn.length > 0) {
    fields.push({ name: "h_workspace", label: t("workspace.title"), kind: "heading" });
    for (const r of workspaceOn) {
      const id = workspaceModuleId(r.key);
      fields.push({
        name: workspaceField(r.key),
        label: t(`workspace.items.${id}.title`),
        help: t(`workspace.items.${id}.help`),
        kind: "checkbox",
      });
      values[workspaceField(r.key)] = r.enabled ? "on" : "";
    }
  }
  return { website, workspace, fields, values };
}

/** Saves the toggles; modules outside the plan keep their stored switch (content is never lost). */
export async function saveModules(
  scope: AuthorizedScope<"site.modules.manage">,
  form: FormData,
): Promise<FormState> {
  const repos = await getRequestRepositories();
  const tenant = await repos.tenants.current(scope.ctx);
  const t = await getT("admin.content.errors");
  if (tenant === null) {
    return { status: "invalid", errors: { _form: t("notFound") }, values: {} };
  }
  const ent = await entitlementsFor(scope.ctx);
  const next = applyModuleToggles(tenant.siteConfig, formValues(form, FIELD_NAMES), ent);
  await repos.tenants.updateSiteConfig(scope.ctx, next);
  redirect("/admin/modulok?mentve=1");
}

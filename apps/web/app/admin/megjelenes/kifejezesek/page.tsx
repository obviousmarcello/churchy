import { notFound } from "next/navigation";
import type { Denomination } from "@churchy/contracts";
import {
  DENOMINATIONS,
  DENOMINATIONAL_TERM_KEYS,
  SECTION_TERM_KEYS,
  TERM_KEYS,
  effectiveConfig,
  getPreset,
  isBeta,
  presetDiff,
} from "@churchy/presets";
import {
  TermsEditor,
  type DiffView,
  type PresetOption,
  type TermRow,
} from "@/components/appearance/terms-editor";
import { getT } from "@/i18n/server";
import { getRequestRepositories } from "@/server/repositories";
import { getAdminCtx } from "@/server/admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.appearance.terms"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** Terms that are URL segments of the public site (the editor shows and redirects their slug). */
const ROUTED = new Set<string>([
  "serviceSchedule",
  ...SECTION_TERM_KEYS.filter((k) => k !== "homePage"),
]);

/** *Felekezet és kifejezések* (D-23): preset choice with diff preview, term overrides with preview. */
export default async function TermsPage() {
  const t = await getT("admin.appearance.terms");
  const { tenants } = await getRequestRepositories();
  const tenant = await tenants.current(await getAdminCtx());
  if (tenant === null) notFound();

  const source = {
    name: tenant.name,
    denomination: tenant.denomination,
    siteConfig: tenant.siteConfig,
  };
  const config = effectiveConfig(source);
  const presetConfig = effectiveConfig({ name: tenant.name, denomination: tenant.denomination });
  const overridden = new Set(Object.keys(tenant.siteConfig.terminology ?? {}));

  const presets: PresetOption[] = DENOMINATIONS.map((key) => ({
    key,
    name: getPreset(key).name,
    beta: isBeta(key),
  }));

  const diffs: Partial<Record<Denomination, DiffView>> = {};
  for (const to of DENOMINATIONS) {
    if (to === tenant.denomination) continue;
    const d = presetDiff(tenant.denomination, to, tenant.siteConfig);
    diffs[to] = {
      terms: d.terms.map((c) => ({ key: c.key, from: c.from.nom, to: c.to.nom })),
      modules: d.modules.map((m) => ({ key: m.key, to: m.to })),
      rites: {
        added: d.rites.added.map((r) => r.forms.nom),
        removed: d.rites.removed.map((r) => r.forms.nom),
        renamed: d.rites.renamed.map((r) => ({ from: r.from.forms.nom, to: r.to.forms.nom })),
      },
      serviceTypes: {
        added: d.serviceTypes.added.map((s) => s.forms.nom),
        removed: d.serviceTypes.removed.map((s) => s.forms.nom),
      },
      calendar: d.calendarFamily,
      redirects: d.redirects,
      keptOverrides: d.keptOverrides.map((k) => config.terminology[k]?.nom ?? k),
    };
  }

  const group = (key: string): TermRow["group"] =>
    (DENOMINATIONAL_TERM_KEYS as readonly string[]).includes(key) ? "denominational" : "section";
  const terms: TermRow[] = TERM_KEYS.map((key) => ({
    key,
    group: group(key),
    forms: config.terminology[key],
    preset: presetConfig.terminology[key],
    overridden: overridden.has(key),
    routed: ROUTED.has(key),
  }));

  return (
    <section aria-labelledby="terms-page-heading" className="grid gap-6">
      <div>
        <h2 id="terms-page-heading" className="font-heading text-fs-5 font-semibold">
          {t("title")}
        </h2>
        <p className="mt-1 max-w-prose text-muted">{t("lead")}</p>
      </div>
      <TermsEditor
        denomination={tenant.denomination}
        presets={presets}
        diffs={diffs}
        terms={terms}
      />
    </section>
  );
}

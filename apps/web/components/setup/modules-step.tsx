"use client";

import { Alert, Badge, Button, Checkbox } from "@churchy/ui";
import { useT } from "@/i18n/client";
import {
  SETUP_MODULES,
  setupEntitlements,
  toggleModule,
  type ModuleSelection,
  type SetupPlan,
} from "@/lib/setup/modules";

/**
 * Step 3: which internal workspace modules to switch on. Each row is an entitlements-style
 * toggle: a module the plan includes can be switched on and off, one it does not include is
 * shown locked. The plan comes from `setupEntitlements()` (a stub until D-87), never from a
 * plan key in the UI.
 */
export function ModulesStep({
  plan,
  selection,
  onChange,
  onBack,
  onNext,
}: {
  plan: SetupPlan;
  selection: ModuleSelection;
  onChange: (selection: ModuleSelection) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT("admin.setup.modules");
  const entitlements = setupEntitlements(plan);
  const hasSensitive = SETUP_MODULES.some((m) => m.sensitive && selection[m.id]);
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      <ul className="grid gap-3" data-testid="module-list">
        {SETUP_MODULES.map((module) => {
          const entitled = entitlements[module.id];
          const on = selection[module.id];
          return (
            <li
              key={module.id}
              data-module={module.id}
              data-on={on}
              className="grid gap-1 rounded-md border border-border bg-surface-raised p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Checkbox
                  label={t(`items.${module.id}.title`)}
                  help={t(`items.${module.id}.help`)}
                  checked={on}
                  disabled={!entitled && !on}
                  onChange={() => onChange(toggleModule(selection, module.id, entitlements))}
                  wrapperClassName="flex-1"
                />
                {!entitled ? <Badge tone="neutral">{t("notIncluded")}</Badge> : null}
                {module.sensitive ? <Badge tone="info">{t("sensitive")}</Badge> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {hasSensitive ? (
        <Alert tone="info" title={t("securityTitle")}>
          <p>{t("securityBody")}</p>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onNext} data-testid="modules-next">
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

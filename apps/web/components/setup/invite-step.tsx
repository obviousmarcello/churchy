"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Input, Select } from "@churchy/ui";
import { useT } from "@/i18n/client";
import {
  MAX_INVITES,
  addInvite,
  availableRoles,
  removeInvite,
  type Invite,
  type InviteError,
  type SetupSettings,
} from "@/lib/setup/invites";
import type { ModuleSelection } from "@/lib/setup/modules";

/**
 * Step 4: people to invite, with their roles, and a few settings. Mock: nothing is sent; the
 * addresses stay in the browser and the demo uses fictitious ones.
 */
export function InviteStep({
  selection,
  invites,
  settings,
  onInvites,
  onSettings,
  onBack,
  onNext,
}: {
  selection: ModuleSelection;
  invites: readonly Invite[];
  settings: SetupSettings;
  onInvites: (invites: Invite[]) => void;
  onSettings: (settings: SetupSettings) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT("admin.setup.invites");
  const roles = availableRoles(selection);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(roles[0]?.key ?? "");
  const [error, setError] = useState<InviteError | null>(null);

  function add() {
    const result = addInvite(invites, { email, role }, selection);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setEmail("");
    onInvites(result.list);
  }

  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-fs-4 text-muted">{t("lead")}</p>
      <Alert tone="info">
        <p>{t("mockNote")}</p>
      </Alert>

      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          label={t("email")}
          type="email"
          value={email}
          autoComplete="off"
          error={error === null ? undefined : t(`errors.${error}`, { max: MAX_INVITES })}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        <Select
          label={t("role")}
          value={role}
          options={roles.map((r) => ({ value: r.key, label: t(`roles.${r.key}`) }))}
          onChange={(e) => setRole(e.target.value)}
        />
        <Button type="submit" variant="secondary" className="mb-1">
          {t("add")}
        </Button>
      </form>

      {invites.length === 0 ? (
        <p className="text-muted" data-testid="invite-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="invite-list" aria-label={t("listLabel")}>
          {invites.map((invite) => (
            <li
              key={invite.email}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-2"
            >
              <span>
                <span className="font-semibold">{invite.email}</span>
                <span className="text-muted"> · {t(`roles.${invite.role}`)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onInvites(removeInvite(invites, invite.email))}
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="grid gap-3">
        <legend className="mb-1 font-heading text-fs-5 font-semibold">{t("settings.title")}</legend>
        <Input
          label={t("settings.notifyEmail")}
          help={t("settings.notifyHelp")}
          type="email"
          value={settings.notifyEmail}
          onChange={(e) => onSettings({ ...settings, notifyEmail: e.target.value })}
        />
        <Checkbox
          label={t("settings.comingSoon")}
          help={t("settings.comingSoonHelp")}
          checked={settings.comingSoon}
          onChange={(e) => onSettings({ ...settings, comingSoon: e.target.checked })}
        />
        <Checkbox
          label={t("settings.weeklyReminder")}
          checked={settings.weeklyReminder}
          onChange={(e) => onSettings({ ...settings, weeklyReminder: e.target.checked })}
        />
        <p className="text-fs-2 text-muted">{t("settings.fixed")}</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onNext} data-testid="invites-next">
          {t("next")}
        </Button>
      </div>
    </div>
  );
}

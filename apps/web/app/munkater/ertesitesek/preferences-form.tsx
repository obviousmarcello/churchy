"use client";

import { useActionState, useState } from "react";

import { FieldMessage } from "@/components/music/form-field";
import { FormFooter, submitWithoutReset } from "@/components/music/form-parts";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { useI18n } from "@/i18n/music/client";
import { REMINDER_DAYS, SETLIST_HOURS } from "@/lib/music/notifications";
import type { NotificationPreferencesDTO } from "@/server/music/models/notification-preferences";
import type { FormState } from "@/server/music/form-state";
import { updatePreferencesAction } from "./actions-client";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * The emails on or off, and the kinds of notifications, for the emails and
 * for push. Push on this device is apart (`push-device.tsx`). `pushEnabled`:
 * the server can send push; else the push-only kinds do not show.
 */
export function NotificationsForm({
  preferences,
  pushEnabled,
}: {
  preferences: NotificationPreferencesDTO;
  pushEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePreferencesAction, initialState);
  const { m } = useI18n();
  const t = m.notifications.form;

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
      <Option name="email" label={t.emailLabel} hint={t.recipient} checked={preferences.email} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 pt-2 text-sm">
          <h3 className="font-medium">{t.kindsTitle}</h3>
          {pushEnabled && <p className="text-muted">{t.kindsHint}</p>}
        </div>
        <Option
          name="eventAdded"
          label={t.eventAddedLabel}
          hint={t.eventAddedHint}
          checked={preferences.eventAdded}
        />
        <Option
          name="eventReminder"
          label={t.eventReminderLabel}
          hint={t.eventReminderHint}
          checked={preferences.eventReminder}
        >
          {(on) => (
            <NumberField
              name="reminderDays"
              label={t.reminderDaysLabel}
              limits={REMINDER_DAYS}
              on={on}
              defaultValue={preferences.reminderDays}
              errors={state.fieldErrors.reminderDays}
            />
          )}
        </Option>
        <Option
          name="setlist"
          label={t.setlistLabel}
          hint={t.setlistHint}
          checked={preferences.setlist}
        >
          {(on) => (
            <NumberField
              name="setlistHours"
              label={t.setlistHoursLabel}
              limits={SETLIST_HOURS}
              on={on}
              defaultValue={preferences.setlistHours}
              errors={state.fieldErrors.setlistHours}
            />
          )}
        </Option>
      </div>

      <FormFooter state={state}>
        <Button type="submit" disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </FormFooter>
    </form>
  );
}

/**
 * A checkbox card. `children` renders the setting of the option, e.g. the
 * number of days, and gets whether the option is on.
 */
function Option({
  name,
  label,
  hint,
  checked,
  children,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  children?: (on: boolean) => React.ReactNode;
}) {
  const [on, setOn] = useState(checked);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3 text-sm has-[input[type=checkbox]:checked]:border-primary has-[input[type=checkbox]:checked]:bg-primary/5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={name}
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          aria-describedby={`${name}-hint`}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{label}</span>
          <span id={`${name}-hint`} className="text-muted wrap-anywhere">
            {hint}
          </span>
        </span>
      </label>
      {children && <div className="pl-7">{children(on)}</div>}
    </div>
  );
}

function NumberField({
  name,
  label,
  limits,
  on,
  defaultValue,
  errors,
}: {
  name: string;
  label: string;
  limits: { min: number; max: number };
  /**
   * False while the option is off: then the field is disabled, the form does
   * not send it, and the saved number stays.
   */
  on: boolean;
  defaultValue: number;
  errors?: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Input
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          required={on}
          disabled={!on}
          min={limits.min}
          max={limits.max}
          step={1}
          defaultValue={defaultValue}
          className="w-20 shrink-0"
          aria-invalid={(errors?.length ?? 0) > 0 || undefined}
          aria-describedby={`${name}-description`}
        />
        {/* `leading-snug`: a label that wraps on a phone keeps its line spacing. */}
        <Label htmlFor={name} className="leading-snug font-normal">
          {label}
        </Label>
      </div>
      <FieldMessage id={`${name}-description`} errors={errors} />
    </div>
  );
}

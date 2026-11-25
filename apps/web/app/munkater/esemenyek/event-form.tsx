"use client";

import { useActionState } from "react";

import { Field } from "@/components/music/form-field";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { usePolicyAction } from "@/lib/music/policy-form";
import type { FormState } from "@/server/music/form-state";

const IDLE: FormState = { status: "idle", message: null, fieldErrors: {} };

/** The form of a new event or of the details of one (a series, or one occurrence of it). */
export function EventForm({
  action,
  submitLabel,
  pendingLabel,
  initial,
  hidden,
  showRecurrence,
  cancel,
}: {
  action: (previous: FormState, formData: FormData) => Promise<never> | Promise<unknown>;
  submitLabel: string;
  pendingLabel: string;
  initial?: {
    title: string;
    startsAt: string;
    durationMinutes: number;
    youtubeUrl: string | null;
    isPrivate: boolean;
  };
  hidden?: Record<string, string>;
  showRecurrence: boolean;
  cancel: string;
}) {
  const { m } = useI18n();
  const run = usePolicyAction(action as (p: FormState, f: FormData) => Promise<never>);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    (previous, formData) => run(previous, formData) as Promise<FormState>,
    IDLE,
  );
  const t = m.events;
  return (
    <form action={formAction} className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 sm:px-6">
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Field name="title" label={t.fields.title} errors={state.fieldErrors.title}>
        <Input id="title" name="title" required maxLength={200} defaultValue={initial?.title} />
      </Field>
      <Field
        name="startsAt"
        label={t.fields.startsAt}
        hint={t.fields.startsAtHint}
        errors={state.fieldErrors.startsAt}
      >
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={initial?.startsAt}
        />
      </Field>
      <Field
        name="durationMinutes"
        label={t.fields.duration}
        errors={state.fieldErrors.durationMinutes}
      >
        <Input
          id="durationMinutes"
          name="durationMinutes"
          type="number"
          min={1}
          max={1440}
          defaultValue={initial?.durationMinutes ?? 90}
        />
      </Field>
      <Field
        name="youtubeUrl"
        label={t.fields.youtube}
        hint={t.fields.youtubeHint}
        errors={state.fieldErrors.youtubeUrl}
      >
        <Input id="youtubeUrl" name="youtubeUrl" defaultValue={initial?.youtubeUrl ?? ""} />
      </Field>
      {showRecurrence && (
        <Field name="recurrence" label={t.fields.rrule} hint={t.fields.rruleHint}>
          <NativeSelect id="recurrence" name="recurrence" defaultValue="none">
            <option value="none">{t.fields.rruleNone}</option>
            <option value="weekly">{t.fields.rruleWeekly}</option>
            <option value="biweekly">{t.fields.rruleBiweekly}</option>
            <option value="monthly">{t.fields.rruleMonthly}</option>
          </NativeSelect>
        </Field>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="isPrivate"
          defaultChecked={initial?.isPrivate}
          className="mt-1 size-4"
        />
        <span>
          <span className="font-medium">{t.fields.private}</span>
          <span className="block text-muted">{t.fields.privateHint}</span>
        </span>
      </label>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
        <Link href={cancel} className={buttonVariants({ variant: "outline" })}>
          {m.common.actions.cancel}
        </Link>
      </div>
    </form>
  );
}

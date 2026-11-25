"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/music/form-field";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { usePolicyAction } from "@/lib/music/policy-form";
import type { FormState } from "@/server/music/form-state";
import { createSeriesAction } from "../../actions";

const IDLE: FormState = { status: "idle", message: null, fieldErrors: {} };

/** The bulk form: the same times on the chosen weekdays between two days, e.g. each Sunday for three months. */
export function SeriesForm() {
  const { m } = useI18n();
  const t = m.events.series;
  const [slots, setSlots] = useState([0]);
  const run = usePolicyAction(createSeriesAction);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    (_previous, formData) => run(formData) as Promise<FormState>,
    IDLE,
  );
  return (
    <form action={formAction} className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{t.lead}</p>
      <Field name="from" label={t.from}>
        <Input id="from" name="from" type="date" required />
      </Field>
      <Field name="until" label={t.until}>
        <Input id="until" name="until" type="date" required />
      </Field>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-medium">{t.weekdays}</legend>
        {[1, 2, 3, 4, 5, 6, 0].map((day) => (
          <label key={day} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="weekday" value={day} defaultChecked={day === 0} />
            {t.days[String(day) as "0"]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t.slots}</legend>
        {slots.map((slot) => (
          <div key={slot} className="flex flex-wrap items-end gap-2">
            <Input
              name="slotTitle"
              required
              maxLength={200}
              placeholder={t.slotTitle}
              aria-label={t.slotTitle}
            />
            <Input
              name="slotTime"
              type="time"
              required
              defaultValue="10:00"
              aria-label={t.slotTime}
              className="w-28"
            />
            <Input
              name="slotDuration"
              type="number"
              min={1}
              max={1440}
              defaultValue={90}
              aria-label={t.slotDuration}
              className="w-24"
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setSlots((now) => [...now, now.length])}
        >
          {t.addSlot}
        </Button>
      </fieldset>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message ?? t.invalid}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t.pending : t.submit}
      </Button>
    </form>
  );
}

"use client";

import { useId, useState, type ComponentProps } from "react";

import { Field, FieldMessage } from "@/components/music/form-field";
import { GroupOption } from "@/components/music/group-option";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { useBrowserValue } from "@/lib/music/browser";
import {
  canChangeEventArea,
  lockedEventAreas,
  toggleEventArea,
  type EventScopeOptions,
} from "@/lib/music/event-scopes";
import { YOUTUBE_URL_MAX_LENGTH } from "@/lib/music/youtube";
import type { EventFormState } from "./actions";

export type EventFieldValues = {
  title: string;
  /** ISO 8601 timestamp, or null for a new event. */
  startsAt: string | null;
  durationMinutes: number;
  youtubeUrl: string | null;
  /** Only the volunteers, the user who created it and the superadmins see it. */
  isPrivate: boolean;
  /** The groups of the event. Null: the root group (a new event). */
  areaIds: string[] | null;
};

/** The title, start time, duration, YouTube link, privacy and groups of an event. Used to add and to edit. */
export function EventFields({
  values,
  state,
  scope,
  autoFocus,
}: {
  values: EventFieldValues;
  state: EventFormState;
  scope: EventScopeOptions;
  autoFocus?: boolean;
}) {
  const { m } = useI18n();

  function fieldProps(name: string) {
    const invalid = (state.fieldErrors[name]?.length ?? 0) > 0;
    return {
      id: name,
      name,
      "aria-invalid": invalid || undefined,
      "aria-describedby": `${name}-description`,
    };
  }

  return (
    <div className="@container flex flex-col gap-4">
      <Field
        name="title"
        label={m.events.fields.title}
        hint={m.events.fields.titleHint}
        errors={state.fieldErrors.title}
      >
        <Input
          {...fieldProps("title")}
          required
          maxLength={200}
          defaultValue={values.title}
          autoFocus={autoFocus}
        />
      </Field>

      {/* Side by side only with room for the date and time picker: not in the edit dialog. */}
      <div className="grid gap-4 @lg:grid-cols-2">
        <StartsAtField initial={values.startsAt} errors={state.fieldErrors.startsAt} />
        <Field
          name="durationMinutes"
          label={m.events.fields.duration}
          hint={m.events.fields.durationHint}
          errors={state.fieldErrors.durationMinutes}
        >
          <Input
            {...fieldProps("durationMinutes")}
            type="number"
            required
            min={1}
            max={1440}
            step={1}
            defaultValue={values.durationMinutes}
          />
        </Field>
      </div>

      <Field
        name="youtubeUrl"
        label={m.events.fields.youtubeUrl}
        hint={m.events.fields.youtubeUrlHint}
        errors={state.fieldErrors.youtubeUrl}
      >
        <Input
          {...fieldProps("youtubeUrl")}
          inputMode="url"
          autoComplete="off"
          maxLength={YOUTUBE_URL_MAX_LENGTH}
          placeholder="https://youtu.be/…"
          defaultValue={values.youtubeUrl ?? ""}
        />
      </Field>

      <PrivateEventField name="isPrivate" defaultChecked={values.isPrivate} />

      <EventGroupsField scope={scope} initial={values.areaIds} errors={state.fieldErrors.areaIds} />
    </div>
  );
}

/**
 * The groups of the event: boxes that send `areaIds`. The root group (all
 * users) excludes the other groups. A user who is not a superadmin sees the
 * groups that they are a member of, and the other groups of the event locked.
 * The locked groups stay in the list: a check on the root group removes them,
 * and they come back without it. Also in the form of several events.
 */
export function EventGroupsField({
  scope,
  initial,
  errors,
}: {
  scope: EventScopeOptions;
  /** Null: the root group. */
  initial: string[] | null;
  errors?: string[];
}) {
  const { m, format } = useI18n();
  const t = m.events.fields;
  const id = useId();
  const rootName = scope.groups.find((group) => group.isRoot)?.label ?? "";
  const [areaIds, setAreaIds] = useState<string[]>(
    () => initial ?? scope.groups.filter((group) => group.isRoot).map((group) => group.id),
  );
  const [locked] = useState(() => lockedEventAreas(initial ?? [], scope));
  const options = scope.groups.filter(
    (group) =>
      canChangeEventArea(scope, group.id) ||
      locked.includes(group.id) ||
      areaIds.includes(group.id),
  );
  const hasLocked = options.some((group) => !canChangeEventArea(scope, group.id));
  const invalid = (errors?.length ?? 0) > 0;

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={invalid ? `${id}-hint ${id}-errors` : `${id}-hint`}
    >
      <legend className="mb-1 text-sm leading-none font-medium">{t.groups}</legend>
      <p id={`${id}-hint`} className="text-sm text-muted">
        {format(t.groupsHint, { root: rootName })}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((group) => {
          const editable = canChangeEventArea(scope, group.id);
          return (
            <GroupOption
              key={group.id}
              label={group.label}
              checked={areaIds.includes(group.id)}
              onChange={(checked) =>
                setAreaIds(toggleEventArea(areaIds, group.id, checked, scope, locked))
              }
              locked={!editable}
              // The note below says why a box is off: the user is not a member of the group.
              describedBy={editable ? undefined : `${id}-locked`}
            />
          );
        })}
      </div>
      {hasLocked && (
        <p id={`${id}-locked`} className="text-sm text-muted">
          {format(t.groupsLocked, { root: rootName })}
        </p>
      )}
      {/* The marker: the field is in the form, also when no group is selected. */}
      <input type="hidden" name="areaIdsField" value="1" />
      {areaIds.map((areaId) => (
        <input key={areaId} type="hidden" name="areaIds" value={areaId} />
      ))}
      <FieldMessage id={`${id}-errors`} errors={errors} />
    </fieldset>
  );
}

/** The "Private event" checkbox, with its hint. Also in the form of several events. */
export function PrivateEventField(
  props: Omit<ComponentProps<"input">, "type" | "className" | "aria-describedby">,
) {
  const { m } = useI18n();

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        {...props}
        type="checkbox"
        aria-describedby="isPrivate-hint"
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col gap-1">
        <span className="font-medium">{m.events.fields.isPrivate}</span>
        <span id="isPrivate-hint" className="text-muted">
          {m.events.fields.isPrivateHint}
        </span>
      </span>
    </label>
  );
}

/**
 * The start time in the browser's time zone. The server does not know that
 * time zone, so the field fills in only after hydration, and a hidden input
 * sends the time in UTC.
 */
function StartsAtField({ initial, errors }: { initial: string | null; errors?: string[] }) {
  const { m, format } = useI18n();
  const isClient = useBrowserValue(() => true, false);
  // Null until the user changes the field.
  const [edited, setEdited] = useState<string | null>(null);

  const local = edited ?? (isClient && initial ? toLocalInputValue(initial) : "");
  const timeZone = isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return (
    <Field
      name="startsAt"
      label={m.events.fields.startsAt}
      hint={
        timeZone
          ? format(m.events.fields.timeZoneHint, { timeZone: timeZone.replaceAll("_", " ") })
          : m.events.fields.timeZoneHintUnknown
      }
      errors={errors}
    >
      <Input
        id="startsAt"
        type="datetime-local"
        required
        value={local}
        onChange={(event) => setEdited(event.target.value)}
        aria-invalid={(errors?.length ?? 0) > 0 || undefined}
        aria-describedby="startsAt-description"
      />
      <input type="hidden" name="startsAt" value={toIsoString(local)} />
    </Field>
  );
}

/** "2026-10-07T18:30:00.000Z" to "2026-10-07T20:30" in the browser's time zone. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The reverse of `toLocalInputValue()`. Empty for an empty or invalid value. */
function toIsoString(local: string): string {
  if (!local) return "";
  // A date-time without an offset is read in the browser's time zone.
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

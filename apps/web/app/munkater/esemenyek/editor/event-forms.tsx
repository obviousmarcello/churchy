"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CopyPlusIcon, PencilIcon, Trash2Icon, UserPlusIcon, XIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_FORM_CLASS,
  DIALOG_POPUP_CLASS,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Field } from "@/components/music/form-field";
import {
  ConfirmDialog,
  ConfirmDialogTrigger,
  FormFooter,
  submitWithoutReset,
} from "@/components/music/form-parts";
import { invalidating } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import { NativeSelect } from "@/components/music/ui/native-select";
import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import type { EventScopeOptions } from "@/lib/music/event-scopes";
import { nextWeekStart } from "@/lib/music/event-time";
import { personName } from "@/lib/music/format";
import { changedPages } from "@/lib/music/page-keys";
import { cn } from "@/lib/music/utils";
import {
  addVolunteerAction,
  copyEventAction,
  deleteEventAction,
  removeVolunteerAction,
  updateEventAction,
  type EventFormState,
} from "./actions-client";
import { EventFields, type EventFieldValues } from "./event-fields";

const initialState: EventFormState = { status: "idle", message: null, fieldErrors: {} };

/** The "Edit details" button and its dialog with the title, start time, duration, privacy and groups. */
export function EditDetailsDialog({
  eventId,
  values,
  scope,
}: {
  eventId: string;
  values: EventFieldValues;
  scope: EventScopeOptions;
}) {
  const { m } = useI18n();

  return (
    <FormDialog
      trigger={
        <>
          <PencilIcon />
          {m.events.forms.editDetails}
        </>
      }
      title={m.events.forms.editDetails}
      description={m.events.forms.editDetailsDescription}
    >
      <DetailsForm eventId={eventId} values={values} scope={scope} />
    </FormDialog>
  );
}

/**
 * The details of the event. Until the user changes a field, the fields follow
 * the changes of other users. The save sends the values that the form started
 * with too: the server changes only the fields that the user changed.
 */
function DetailsForm({
  eventId,
  values,
  scope,
}: {
  eventId: string;
  values: EventFieldValues;
  scope: EventScopeOptions;
}) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.event(eventId), updateEventAction),
    initialState,
  );
  const { m } = useI18n();
  const [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(values);
  if (!touched && JSON.stringify(values) !== JSON.stringify(shown)) setShown(values);

  return (
    <form
      onSubmit={submitWithoutReset(formAction)}
      onInput={() => setTouched(true)}
      className={DIALOG_FORM_CLASS}
    >
      <input type="hidden" name="id" value={eventId} />
      <input type="hidden" name="original" value={JSON.stringify(shown)} />
      <DialogBody>
        <EventFields key={JSON.stringify(shown)} values={shown} state={state} scope={scope} />
      </DialogBody>
      <DialogFooter className="gap-4">
        {state.fieldErrors.endProjections && (
          <EndProjectionsField errors={state.fieldErrors.endProjections} />
        )}
        <FormFooter state={state}>
          <Button type="submit" disabled={pending}>
            {pending ? m.common.actions.saving : m.events.forms.saveChanges}
          </Button>
        </FormFooter>
      </DialogFooter>
    </form>
  );
}

/**
 * After a change that would take an open projection from its user: the box
 * that ends the projection with the next save.
 */
function EndProjectionsField({ errors }: { errors: string[] }) {
  const { m } = useI18n();

  return (
    <div className="flex flex-col gap-2">
      <p role="alert" id="endProjections-description" className="text-sm text-danger">
        {errors.join(" ")}
      </p>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="endProjections"
          aria-describedby="endProjections-description"
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="font-medium">{m.events.forms.endProjections}</span>
      </label>
    </div>
  );
}

/** The "Copy event" button and its dialog: the details of the copy, and whether to copy the items and the volunteers. */
export function CopyEventDialog({
  eventId,
  values,
  scope,
  itemCount,
  volunteerCount,
  open,
  onOpenChange,
}: {
  eventId: string;
  /** The details of the event. */
  values: EventFieldValues & { startsAt: string };
  scope: EventScopeOptions;
  itemCount: number;
  volunteerCount: number;
  /** With `open`, a menu item opens the dialog: no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { m } = useI18n();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        open === undefined && (
          <>
            <CopyPlusIcon />
            {m.events.forms.copyEvent}
          </>
        )
      }
      title={m.events.forms.copyTitle}
      description={m.events.forms.copyDescription}
    >
      <CopyForm
        eventId={eventId}
        values={values}
        scope={scope}
        itemCount={itemCount}
        volunteerCount={volunteerCount}
      />
    </FormDialog>
  );
}

// The dialog renders it only when it opens, so the start is one week after the time of the open.
function CopyForm({
  eventId,
  values,
  scope,
  itemCount,
  volunteerCount,
}: {
  eventId: string;
  values: EventFieldValues & { startsAt: string };
  scope: EventScopeOptions;
  itemCount: number;
  volunteerCount: number;
}) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.eventList(), copyEventAction),
    initialState,
  );
  const [startsAt] = useState(() => nextWeekStart(values.startsAt, Date.now()));
  const { m, plural } = useI18n();

  return (
    <form onSubmit={submitWithoutReset(formAction)} className={DIALOG_FORM_CLASS}>
      <input type="hidden" name="id" value={eventId} />
      <DialogBody>
        <EventFields values={{ ...values, startsAt }} state={state} scope={scope} />
        <div className="flex flex-col gap-3 border-t pt-4">
          <CopyOption
            name="copyItems"
            label={
              itemCount > 0
                ? plural(m.events.forms.copyItems, itemCount)
                : m.events.forms.noItemsToCopy
            }
            disabled={itemCount === 0}
          />
          <CopyOption
            name="copyVolunteers"
            label={
              volunteerCount > 0
                ? plural(m.events.forms.copyVolunteers, volunteerCount)
                : m.events.forms.noVolunteersToCopy
            }
            hint={volunteerCount > 0 ? m.events.forms.copyVolunteersHint : undefined}
            disabled={volunteerCount === 0}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <FormFooter state={state}>
          <Button type="submit" disabled={pending}>
            {pending ? m.events.forms.copying : m.events.forms.copySubmit}
          </Button>
        </FormFooter>
      </DialogFooter>
    </form>
  );
}

/** A checkbox of the copy form. It is on at first; a disabled box sends nothing, which means "off". */
function CopyOption({
  name,
  label,
  hint,
  disabled,
}: {
  name: string;
  label: string;
  hint?: string;
  disabled: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm has-disabled:text-muted">
      <input
        type="checkbox"
        name={name}
        defaultChecked={!disabled}
        disabled={disabled}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-0.5 size-4 accent-primary"
      />
      <span className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        {hint && (
          <span id={`${name}-hint`} className="text-muted">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

/** The "Manage" button of the volunteers and its dialog: add and remove volunteers. */
export function ManageVolunteersDialog({
  eventId,
  volunteers,
  others,
  unnamedHidden,
}: {
  eventId: string;
  /** The volunteers, by name. */
  volunteers: AvatarPerson[];
  /** The users who are not volunteers, by name. */
  others: AvatarPerson[];
  /** True if `others` leaves out the users without a display name (`listUserOptions()`). */
  unnamedHidden: boolean;
}) {
  const { m } = useI18n();

  return (
    <FormDialog
      trigger={
        <>
          <UserPlusIcon />
          {m.events.forms.manage}
        </>
      }
      triggerVariant="secondary"
      title={m.events.forms.volunteersTitle}
      description={m.events.forms.volunteersDescription}
    >
      <VolunteersForm
        eventId={eventId}
        volunteers={volunteers}
        others={others}
        unnamedHidden={unnamedHidden}
      />
    </FormDialog>
  );
}

function VolunteersForm({
  eventId,
  volunteers,
  others,
  unnamedHidden,
}: {
  eventId: string;
  volunteers: AvatarPerson[];
  others: AvatarPerson[];
  unnamedHidden: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.event(eventId), addVolunteerAction),
    initialState,
  );
  const i18n = useI18n();
  const { m } = i18n;

  return (
    <DialogBody>
      {volunteers.length > 0 ? (
        <ul className="divide-y rounded-card border">
          {volunteers.map((person) => (
            <VolunteerRow key={person.id} eventId={eventId} person={person} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{m.events.forms.noVolunteers}</p>
      )}

      {others.length > 0 ? (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={eventId} />
          <Field
            name="userId"
            label={m.events.forms.addVolunteerLabel}
            errors={state.fieldErrors.userId}
          >
            <NativeSelect
              id="userId"
              name="userId"
              defaultValue=""
              required
              aria-invalid={(state.fieldErrors.userId?.length ?? 0) > 0 || undefined}
              aria-describedby="userId-description"
            >
              <option value="" disabled>
                {m.events.forms.selectUser}
              </option>
              {others.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName && person.email
                    ? `${person.displayName} · ${person.email}`
                    : personName(person, i18n)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <FormFooter state={state}>
            <Button type="submit" variant="outline" disabled={pending}>
              <UserPlusIcon />
              {pending ? m.events.forms.adding : m.events.forms.addVolunteer}
            </Button>
          </FormFooter>
        </form>
      ) : (
        <p className="text-sm text-muted">{m.events.forms.everyoneIsVolunteer}</p>
      )}
      {unnamedHidden && <p className="text-sm text-muted">{m.events.forms.unnamedHidden}</p>}
    </DialogBody>
  );
}

function VolunteerRow({ eventId, person }: { eventId: string; person: AvatarPerson }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.event(eventId), removeVolunteerAction),
    initialState,
  );
  const i18n = useI18n();
  const { m, format } = i18n;
  const name = personName(person, i18n);

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      <div className="flex items-center gap-3">
        <UserAvatar person={person} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          {person.displayName && person.email && (
            <span className="truncate text-sm text-muted">{person.email}</span>
          )}
        </div>
        <form action={formAction}>
          <input type="hidden" name="id" value={eventId} />
          <input type="hidden" name="userId" value={person.id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label={format(m.events.forms.removeVolunteer, { name })}
            disabled={pending}
          >
            <XIcon />
          </Button>
        </form>
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.fieldErrors.endProjections && (
        <form
          action={formAction}
          className="flex flex-wrap items-center gap-x-2 text-sm text-danger"
        >
          <p role="alert">{state.fieldErrors.endProjections.join(" ")}</p>
          <input type="hidden" name="id" value={eventId} />
          <input type="hidden" name="userId" value={person.id} />
          <input type="hidden" name="endProjections" value="on" />
          <Button type="submit" variant="link" className="h-auto p-0" disabled={pending}>
            {m.events.forms.removeAndEndProjection}
          </Button>
        </form>
      )}
    </li>
  );
}

export function DeleteEventButton({
  eventId,
  title,
  open: menuOpen,
  onOpenChange: onMenuOpenChange,
}: {
  eventId: string;
  title: string;
  /** With `open`, a menu item opens the dialog: no button of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.event(eventId), deleteEventAction),
    initialState,
  );
  const [ownOpen, setOwnOpen] = useState(false);
  const open = menuOpen ?? ownOpen;
  const setOpen = onMenuOpenChange ?? setOwnOpen;
  // The result before the dialog opened: its warning about an open projection
  // is old. A new opening asks again, so it does not end a projection that
  // the admin did not see.
  // The check runs at each opening, also when a menu item opens the dialog
  // through `open` (then `onOpenChange` does not run for the opening).
  const [staleState, setStaleState] = useState<typeof state | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStaleState(state);
  }
  const projectionErrors = state !== staleState ? state.fieldErrors.endProjections : undefined;
  const { m, format } = useI18n();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        menuOpen === undefined && (
          <ConfirmDialogTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                className="w-fit text-danger hover:text-danger"
              />
            }
          >
            <Trash2Icon />
            {m.events.forms.deleteEvent}
          </ConfirmDialogTrigger>
        )
      }
      title={m.events.forms.deleteTitle}
      description={rich(m.events.forms.deleteDescription, {
        // The title goes in after the markup is read, so a title with "<…>" stays text.
        strong: (chunk) => <strong className="text-text">{format(chunk, { title })}</strong>,
      })}
      id={eventId}
      formAction={formAction}
      state={state}
      pending={pending}
      // An open projection stops the delete: the dialog asks whether to close it.
      confirmLabel={
        projectionErrors ? m.events.forms.deleteAndEndProjection : m.events.forms.deleteEvent
      }
      pendingLabel={m.common.actions.deleting}
      fields={projectionErrors && <input type="hidden" name="endProjections" value="on" />}
      body={
        projectionErrors && (
          <p role="alert" className="text-sm text-danger">
            {projectionErrors.join(" ")}
          </p>
        )
      }
    />
  );
}

/** A button that opens a dialog with a form. `children` holds a `DialogBody` and a `DialogFooter`. */
export function FormDialog({
  trigger,
  title,
  description,
  triggerVariant = "outline",
  open,
  onOpenChange,
  children,
}: {
  /** The content of the button. Without it (e.g. a menu item opens the dialog with `open`), no button. */
  trigger: React.ReactNode;
  /** `secondary` for the main action of a section, e.g. "Manage" of the volunteers. */
  triggerVariant?: "outline" | "secondary";
  title: string;
  description: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const { m } = useI18n();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* Round, as the other actions of the event page. */}
      {trigger && (
        <Dialog.Trigger
          render={<Button type="button" variant={triggerVariant} className="rounded-full" />}
        >
          {trigger}
        </Dialog.Trigger>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-lg")}>
          <DialogHeader className="flex-row items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted">{description}</Dialog.Description>
            </div>
            <Dialog.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.common.actions.close}
                />
              }
            >
              <XIcon />
            </Dialog.Close>
          </DialogHeader>
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

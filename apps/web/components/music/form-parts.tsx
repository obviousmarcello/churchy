"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { CheckIcon, LoaderCircleIcon } from "lucide-react";

import { useModuleOffRefresh } from "@/components/music/app-config";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { SectionHeading } from "@/components/music/form-field";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { toastResult } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";

// Building blocks for forms that use `useActionState` with a `FormState`
// (see `@/server/form-state`).

type FormResult = {
  status: "idle" | "success" | "error";
  message: string | null;
  /** `moduleOff`: the page loads again (see `useModuleOffRefresh`). */
  code?: string;
};

/** A titled part of a settings page, with one or more forms. */
export function FormSection({
  ref,
  title,
  description,
  className,
  level,
  children,
}: {
  ref?: React.Ref<HTMLElement>;
  title: string;
  description: React.ReactNode;
  className?: string;
  /** The level of the heading (see `SectionHeading`). */
  level?: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <section ref={ref} className={cn("flex flex-col gap-4", className)}>
      <SectionHeading title={title} description={description} level={level} />
      {children}
    </section>
  );
}

/**
 * Shows the message of a success as a toast, once for each submit. Errors
 * stay in the form, next to the fields they belong to.
 */
export function useResultToast(state: FormResult) {
  useEffect(() => toastResult(state), [state]);
}

const IDLE: FormResult = { status: "idle", message: null };

/**
 * The submit button with a note why the button is off, or the error of the
 * last submit. A success shows as a toast, unless `toast` is false: use that
 * when the page already shows the result.
 */
export function FormFooter({
  state,
  note,
  noteId,
  toast = true,
  children,
}: {
  state: FormResult;
  note?: string;
  /** The id of the note, for the `aria-describedby` of the button that it explains. */
  noteId?: string;
  toast?: boolean;
  children: React.ReactNode;
}) {
  useResultToast(toast ? state : IDLE);
  useModuleOffRefresh(state);

  return (
    <div className="flex flex-col gap-2">
      <div>{children}</div>
      {note && (
        <p id={noteId} className="text-sm text-muted">
          {note}
        </p>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

const SAVED_MS = 2000;

/** True for a moment after each success. */
function useJustSaved(state: FormResult): boolean {
  const [saved, setSaved] = useState<FormResult | null>(null);
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    setSaved(state.status === "success" ? state : null);
  }

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), SAVED_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  return saved !== null;
}

/**
 * The buttons of a form with a manual save: "Save changes", and "Cancel"
 * while there are changes. After a success, the save button shows "Saved"
 * for a moment in place of a toast. The error of the last submit shows below.
 * While there are changes, the browser asks before it closes or reloads the
 * page, and a dialog asks before the app goes to another page (`useLeaveGuard`).
 * Put it in the `<form>`: the dialog submits that form.
 */
export function SaveFooter({
  state,
  pending,
  dirty,
  onCancel,
}: {
  state: FormResult;
  pending: boolean;
  /** The fields differ from the saved values. */
  dirty: boolean;
  /** Puts the saved values back in the fields. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const justSaved = useJustSaved(state) && !dirty;
  const footerRef = useRef<HTMLDivElement>(null);
  const leaveGuard = useLeaveGuard({ state, pending, dirty, onCancel, footerRef });
  useModuleOffRefresh(state);

  return (
    <div ref={footerRef} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : justSaved && <CheckIcon />}
          {pending
            ? m.common.actions.saving
            : justSaved
              ? m.common.actions.saved
              : m.common.actions.saveChanges}
        </Button>
        {dirty && !pending && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.common.actions.cancel}
          </Button>
        )}
      </div>
      {/* Always in the page, so screen readers announce the change. */}
      <p role="status" className="sr-only">
        {justSaved ? state.message : ""}
      </p>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <UnsavedChangesDialog {...leaveGuard} />
    </div>
  );
}

/**
 * The dialog of a leave guard: "Save changes", "Discard changes and leave
 * page" (or "Discard changes" when the app stays on the page, e.g. another
 * template of the list), and "Cancel".
 */
function UnsavedChangesDialog({
  asking,
  leavesPage,
  stay,
  discard,
  save,
}: {
  asking: boolean;
  leavesPage: boolean;
  stay: () => void;
  discard: () => void;
  save: () => void;
}) {
  const { m } = useI18n();

  return (
    <AlertDialog.Root open={asking} onOpenChange={(open) => !open && stay()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <AlertDialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
          <DialogHeader>
            <AlertDialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {m.common.form.unsavedTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">
              {m.common.form.unsavedDescription}
            </AlertDialog.Description>
          </DialogHeader>
          <DialogFooter>
            <DialogActions>
              <AlertDialog.Close render={<Button type="button" variant="ghost" />}>
                {m.common.actions.cancel}
              </AlertDialog.Close>
              <Button type="button" variant="outline" onClick={discard}>
                {leavesPage ? m.common.form.discardAndLeave : m.common.form.discard}
              </Button>
              <Button type="button" onClick={save}>
                {m.common.actions.saveChanges}
              </Button>
            </DialogActions>
          </DialogFooter>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

/**
 * The status of controls that save at once (auto-save), near them: "Saving…"
 * while a save runs, then "Change saved" or "N changes saved". Failed saves
 * show an alert with "Try again" until they succeed. While a save waits,
 * runs or failed, the browser asks before it closes or reloads the page, and a dialog
 * asks before the app goes to another page (`useAutoSaveLeaveGuard`).
 */
export function AutoSaveStatus({
  saving,
  waiting = false,
  savedCount,
  failedCount,
  detail,
  onRetry,
  onSaveNow,
  onDiscard,
}: {
  saving: boolean;
  /** A typed change waits for its save (the delay after the last key): no status shows, but the guard asks. */
  waiting?: boolean;
  /** The saves that succeeded since the controls showed. */
  savedCount: number;
  /** The changes that are not saved. */
  failedCount: number;
  /** More about the failure, e.g. "This template does not exist anymore. Reload the page." */
  detail?: string | null;
  /** Saves the failed changes again. */
  onRetry: () => void;
  /** Saves the waiting change at once, e.g. after "Save changes" in the dialog. */
  onSaveNow?: () => void;
  /** Forgets the failed changes: the controls show the saved values. */
  onDiscard: () => void;
}) {
  const { m, plural } = useI18n();
  const t = m.common.autoSave;
  const leaveGuard = useAutoSaveLeaveGuard({
    saving,
    waiting,
    failedCount,
    onRetry,
    onSaveNow,
    onDiscard,
  });

  return (
    <>
      {/* Always in the page, so screen readers announce the change. */}
      <p role="status" className="flex items-center gap-1.5 text-sm text-muted empty:hidden">
        {saving ? (
          <>
            <LoaderCircleIcon className="size-4 animate-spin" />
            {m.common.actions.saving}
          </>
        ) : (
          failedCount === 0 &&
          savedCount > 0 && (
            <>
              <CheckIcon className="size-4" />
              {plural(t.saved, savedCount)}
            </>
          )
        )}
      </p>
      {failedCount > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger"
        >
          <p className="min-w-0 flex-1">
            {plural(t.failed, failedCount)}
            {detail && ` ${detail}`}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t.retry}
          </Button>
        </div>
      )}
      <UnsavedChangesDialog {...leaveGuard} />
    </>
  );
}

/**
 * The leave guard of a page with one save button for several forms (see
 * `PageSave`), while `dirty`. "Save changes" calls `save` and leaves when it
 * gives true; a failed save stays on the page with its errors. "Discard
 * changes and leave page" leaves at once.
 */
export function SaveAllLeaveGuard({
  dirty,
  save,
}: {
  dirty: boolean;
  save: () => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [leavesPage, setLeavesPage] = useState(true);
  // The navigation that the dialog stopped.
  const leaveRef = useRef<(() => void) | null>(null);
  // Removes the guard, e.g. before a discard leaves.
  const removeRef = useRef<(() => void) | null>(null);

  useUnsavedChangesWarning(dirty);

  useEffect(() => {
    if (!dirty) return;
    const remove = addLeaveGuard((leave, leavesPage) => {
      leaveRef.current = leave;
      setLeavesPage(leavesPage);
      setAsking(true);
    });
    removeRef.current = remove;
    return () => {
      remove();
      removeRef.current = null;
    };
  }, [dirty]);

  function leave() {
    const next = leaveRef.current;
    leaveRef.current = null;
    removeRef.current?.();
    removeRef.current = null;
    next?.();
  }

  return (
    <UnsavedChangesDialog
      asking={asking}
      leavesPage={leavesPage}
      stay={() => {
        leaveRef.current = null;
        setAsking(false);
      }}
      discard={() => {
        setAsking(false);
        leave();
      }}
      save={() => {
        setAsking(false);
        void save().then((saved) => {
          if (saved) leave();
          else leaveRef.current = null;
        });
      }}
    />
  );
}

/** The browser asks before it closes or reloads the page while `active`. */
export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

// The navigation in the app ------------------------------------------------------
//
// The router of Next.js has no event before it leaves a page, and
// `beforeunload` does not fire for it. A form with unsaved changes adds a
// guard. A click on a link of this site (in the capture phase, before the
// `Link` of Next.js sees it) and `navigateWithGuard()` ask the first guard.
// The guard asks the user, saves or discards, and then goes on: the next
// guard asks, or the app leaves. The back button of the browser does not go
// through the guards.

/**
 * Asks the user about the unsaved changes of a form, and calls `leave` after a
 * save or a discard. `leavesPage` is false when the app stays on the page.
 */
type LeaveGuard = (leave: () => void, leavesPage: boolean) => void;

const leaveGuards: LeaveGuard[] = [];

function addLeaveGuard(guard: LeaveGuard): () => void {
  leaveGuards.push(guard);
  if (leaveGuards.length === 1) document.addEventListener("click", onLinkClick, true);
  return () => {
    const index = leaveGuards.indexOf(guard);
    if (index >= 0) leaveGuards.splice(index, 1);
    if (leaveGuards.length === 0) document.removeEventListener("click", onLinkClick, true);
  };
}

/** A form of the page has unsaved changes: `navigateWithGuard()` asks first. */
export function hasUnsavedChanges(): boolean {
  return leaveGuards.length > 0;
}

/**
 * Calls `navigate` when no form has unsaved changes, else after the user
 * saved or discarded them. For a navigation without a link, e.g. `router.push()`.
 * `leavesPage: false` for a change in the page, e.g. another selected item.
 */
export function navigateWithGuard(
  navigate: () => void,
  { leavesPage = true }: { leavesPage?: boolean } = {},
): void {
  const guard = leaveGuards[0];
  if (!guard) return navigate();
  guard(() => navigateWithGuard(navigate, { leavesPage }), leavesPage);
}

function onLinkClick(event: MouseEvent) {
  if (leaveGuards.length === 0 || event.defaultPrevented || event.button !== 0) return;
  // A new tab or window keeps this page.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (
    !(link instanceof HTMLAnchorElement) ||
    (link.target && link.target !== "_self") ||
    link.hasAttribute("download")
  )
    return;
  const url = new URL(link.href);
  // Another site: `beforeunload` asks. The same page (e.g. `#top`): nothing is lost.
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;

  event.preventDefault();
  event.stopPropagation();
  // The click again, so the `Link` navigates as usual; without the link, a full load.
  navigateWithGuard(() => (link.isConnected ? link.click() : window.location.assign(link.href)));
}

/**
 * The guard of `SaveFooter` while `dirty`: "Save changes" submits the form
 * and leaves after the success; a failed save stays on the page with its
 * error. "Discard changes and leave page" calls `onCancel` and leaves.
 */
function useLeaveGuard({
  state,
  pending,
  dirty,
  onCancel,
  footerRef,
}: {
  state: FormResult;
  pending: boolean;
  dirty: boolean;
  onCancel: () => void;
  footerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [asking, setAsking] = useState(false);
  const [leavesPage, setLeavesPage] = useState(true);
  // The navigation that the dialog stopped.
  const leaveRef = useRef<(() => void) | null>(null);
  // The user chose "Save changes" or "Discard changes and leave page".
  const leavingRef = useRef(false);

  useUnsavedChangesWarning(dirty);

  useEffect(() => {
    if (!dirty) return;
    return addLeaveGuard((leave, leavesPage) => {
      leaveRef.current = leave;
      setLeavesPage(leavesPage);
      setAsking(true);
    });
  }, [dirty]);

  // Saved or discarded: the guard of this form is gone, so the navigation goes on.
  useEffect(() => {
    if (!leavingRef.current || dirty || pending) return;
    const leave = leaveRef.current;
    leavingRef.current = false;
    leaveRef.current = null;
    leave?.();
  }, [dirty, pending]);

  // A failed save: the user stays and sees the error.
  useEffect(() => {
    if (state.status !== "error") return;
    leavingRef.current = false;
    leaveRef.current = null;
  }, [state]);

  function stay() {
    leaveRef.current = null;
    setAsking(false);
  }

  function save() {
    setAsking(false);
    const form = footerRef.current?.closest("form");
    // The browser shows the missing fields, e.g. the password; the user stays.
    if (!form || !form.checkValidity()) {
      leaveRef.current = null;
      form?.reportValidity();
      return;
    }
    leavingRef.current = true;
    form.requestSubmit();
  }

  function discard() {
    setAsking(false);
    leavingRef.current = true;
    onCancel();
  }

  return { asking, leavesPage, stay, save, discard };
}

/**
 * The guard of `AutoSaveStatus` while a save waits, runs or failed. "Save
 * changes" saves the waiting change at once, tries the failed changes again,
 * waits for the running saves, and leaves
 * when all succeeded; a failure stays on the page with its alert. "Discard
 * changes and leave page" forgets the failed changes and leaves at once.
 */
function useAutoSaveLeaveGuard({
  saving,
  waiting,
  failedCount,
  onRetry,
  onSaveNow,
  onDiscard,
}: {
  saving: boolean;
  waiting: boolean;
  failedCount: number;
  onRetry: () => void;
  onSaveNow?: () => void;
  onDiscard: () => void;
}) {
  const active = saving || waiting || failedCount > 0;
  const [asking, setAsking] = useState(false);
  const [leavesPage, setLeavesPage] = useState(true);
  // The navigation that the dialog stopped.
  const leaveRef = useRef<(() => void) | null>(null);
  // The user chose "Save changes": leave when no save runs or failed.
  const leavingRef = useRef(false);
  // Removes the guard of this component, e.g. before a discard leaves.
  const removeRef = useRef<(() => void) | null>(null);

  useUnsavedChangesWarning(active);

  useEffect(() => {
    if (!active) return;
    const remove = addLeaveGuard((leave, leavesPage) => {
      leaveRef.current = leave;
      setLeavesPage(leavesPage);
      setAsking(true);
    });
    removeRef.current = remove;
    return () => {
      remove();
      removeRef.current = null;
    };
  }, [active]);

  // All saved, also while the dialog asks: the guard of this component is
  // gone, so the navigation goes on.
  useEffect(() => {
    if (active || !(leavingRef.current || asking)) return;
    const leave = leaveRef.current;
    leavingRef.current = false;
    leaveRef.current = null;
    setAsking(false);
    leave?.();
  }, [active, asking]);

  // A failed save: the user stays and sees the alert.
  useEffect(() => {
    if (!leavingRef.current || saving || failedCount === 0) return;
    leavingRef.current = false;
    leaveRef.current = null;
  }, [saving, failedCount]);

  function stay() {
    leaveRef.current = null;
    setAsking(false);
  }

  function save() {
    setAsking(false);
    leavingRef.current = true;
    if (waiting) onSaveNow?.();
    if (failedCount > 0) onRetry();
  }

  function discard() {
    setAsking(false);
    const leave = leaveRef.current;
    leaveRef.current = null;
    // The running saves go on, but the app does not wait for them.
    removeRef.current?.();
    removeRef.current = null;
    onDiscard();
    leave?.();
  }

  return { asking, leavesPage, stay, save, discard };
}

/**
 * After a change of `value`, e.g. a block that puts "Unblock user" in place of
 * "Block user", the focused button can go away, and the focus with it. Then
 * the focus goes to the first button in `ref`, or to `ref` itself.
 */
export function useFocusAfterChange(ref: React.RefObject<HTMLElement | null>, value: unknown) {
  const previous = useRef(value);
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    const container = ref.current;
    const active = document.activeElement;
    if (!container || (active && active !== document.body)) return;
    const target = container.querySelector<HTMLElement>("button:not(:disabled)") ?? container;
    if (target === container && !container.hasAttribute("tabindex")) container.tabIndex = -1;
    target.focus();
  }, [ref, value]);
}

// Submits without the automatic form reset, so the fields keep their values
// when the server rejects them.
export function submitWithoutReset(formAction: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // With the submitter, as a native submit: a button with `name` and `value` adds its field.
    const formData = new FormData(
      event.currentTarget,
      (event.nativeEvent as SubmitEvent).submitter,
    );
    startTransition(() => formAction(formData));
  };
}

/** Opens the `ConfirmDialog` that contains it. Use the `render` prop for the button. */
export const ConfirmDialogTrigger = AlertDialog.Trigger;

/**
 * A destructive action with a confirmation dialog. The form sends the record
 * `id`. Errors show in the dialog. `trigger` must contain a `ConfirmDialogTrigger`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  id,
  formAction,
  state,
  pending,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  fields,
  body,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  id: string;
  formAction: (formData: FormData) => void;
  state: FormResult;
  pending: boolean;
  confirmLabel: string;
  pendingLabel: string;
  /** The label of the button that closes the dialog, e.g. "Cancel, keep user". The default is "Cancel". */
  cancelLabel?: string;
  /** More hidden fields of the form, e.g. after an error that asks a question. */
  fields?: React.ReactNode;
  /** Visible content between the description and the buttons, e.g. a password field. It scrolls. */
  body?: React.ReactNode;
}) {
  const { m } = useI18n();
  useModuleOffRefresh(state);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      {trigger}
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <AlertDialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
          <DialogHeader>
            <AlertDialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">
              {description}
            </AlertDialog.Description>
          </DialogHeader>
          {/* `contents`: the body and the footer are parts of the popup. */}
          <form action={formAction} className="contents">
            <input type="hidden" name="id" value={id} />
            {fields}
            {body && <DialogBody>{body}</DialogBody>}
            <DialogFooter>
              {state.status === "error" && state.message && (
                <p role="alert" className="text-sm text-danger">
                  {state.message}
                </p>
              )}
              <DialogActions>
                <AlertDialog.Close
                  render={<Button type="button" variant="ghost" disabled={pending} />}
                >
                  {cancelLabel ?? m.common.actions.cancel}
                </AlertDialog.Close>
                <Button type="submit" variant="destructive" disabled={pending}>
                  {pending && <LoaderCircleIcon className="animate-spin" />}
                  {pending ? pendingLabel : confirmLabel}
                </Button>
              </DialogActions>
            </DialogFooter>
          </form>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

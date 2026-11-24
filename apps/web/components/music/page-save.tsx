"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";

import { SaveAllLeaveGuard } from "@/components/music/form-parts";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import type { FormState } from "@/server/music/form-state";

// One save button for all the forms of a page, e.g. the song and its files on
// the edit page of a song. Each form registers with `usePageSaveForm`. The
// button saves the forms with changes, in the order of the page. It goes to
// `savedHref` when a form with `leaves` was saved, or when nothing changed;
// after only other forms, e.g. an added link, the page stays and shows the
// result. A form that fails keeps its error, and the page stays.

type Participant = {
  element: () => HTMLElement | null;
  isDirty: () => boolean;
  /** Shows the missing fields of the browser, e.g. a required file. */
  validate: () => boolean;
  save: () => Promise<boolean>;
  /** After its save, the page leaves, e.g. the song form. */
  leaves: boolean;
};

type SaveResult = { saved: boolean; leave: boolean };

type PageSaveValue = {
  register: (id: string, participant: Participant) => () => void;
  setDirty: (id: string, dirty: boolean) => void;
  /** Saves the forms with changes and leaves the page after a success. */
  saveAndLeave: () => void;
  /** Saves the forms with changes. Gives true when all were saved. */
  saveAll: () => Promise<boolean>;
  dirty: boolean;
  saving: boolean;
  failed: boolean;
  savedHref: string;
};

const PageSaveContext = createContext<PageSaveValue | null>(null);

export function PageSave({
  savedHref,
  children,
}: {
  savedHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const participants = useRef(new Map<string, Participant>());
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // The save that runs: a second save waits for it, e.g. "Save changes" of the leave guard.
  const running = useRef<Promise<SaveResult> | null>(null);

  const register = useCallback((id: string, participant: Participant) => {
    participants.current.set(id, participant);
    return () => {
      participants.current.delete(id);
      setDirtyIds((ids) => without(ids, id));
    };
  }, []);

  const setDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((ids) => {
      if (ids.has(id) === dirty) return ids;
      return dirty ? new Set([...ids, id]) : without(ids, id);
    });
  }, []);

  const save = useCallback((): Promise<SaveResult> => {
    if (running.current) return running.current;
    const changed = [...participants.current.values()]
      .filter((participant) => participant.isDirty())
      .toSorted((a, b) => documentOrder(a.element(), b.element()));
    // The alert of an earlier save does not stay.
    setFailed(false);
    // Nothing to save: the page leaves at once.
    if (changed.length === 0) return Promise.resolve({ saved: true, leave: true });
    // The browser shows the first missing field. Nothing is saved before all fields are valid.
    // The bar also says it, e.g. for a field in a closed part.
    if (!changed.every((participant) => participant.validate())) {
      setFailed(true);
      return Promise.resolve({ saved: false, leave: false });
    }

    setSaving(true);
    const run = (async () => {
      // `running` is set before the first save starts.
      await Promise.resolve();
      let firstFailed: Participant | null = null;
      let leave = false;
      for (const participant of changed) {
        let saved = false;
        try {
          saved = await participant.save();
        } catch {
          saved = false;
        }
        if (!saved) firstFailed ??= participant;
        else if (participant.leaves) leave = true;
      }
      running.current = null;
      setSaving(false);
      setFailed(firstFailed !== null);
      // After React showed a hidden part again (see `KeptPanel`).
      const failedElement = firstFailed?.element();
      if (failedElement)
        requestAnimationFrame(() =>
          failedElement.scrollIntoView({ behavior: "smooth", block: "center" }),
        );
      return { saved: firstFailed === null, leave: firstFailed === null && leave };
    })();
    running.current = run;
    return run;
  }, []);

  const saveAll = useCallback(async () => (await save()).saved, [save]);

  const saveAndLeave = useCallback(() => {
    void save().then(({ leave }) => {
      if (leave) router.push(savedHref);
    });
  }, [router, save, savedHref]);

  const value = useMemo(
    () => ({
      register,
      setDirty,
      saveAndLeave,
      saveAll,
      dirty: dirtyIds.size > 0,
      saving,
      failed,
      savedHref,
    }),
    [register, setDirty, saveAndLeave, saveAll, dirtyIds, saving, failed, savedHref],
  );

  return (
    <PageSaveContext value={value}>
      {/* Cmd/Ctrl + Enter saves from all fields, also from a multi-line field. */}
      <div
        className="contents"
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
          // Not from a dialog of the page: its events also come here, through its portal.
          if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target))
            return;
          event.preventDefault();
          saveAndLeave();
        }}
      >
        {children}
      </div>
    </PageSaveContext>
  );
}

/**
 * The bar of the save button of a page: the error, then the buttons. It stays
 * at the bottom of the window, above the tab bar of a phone. Put it at the
 * end of the content.
 */
export function SaveBar({
  error,
  className,
  children,
}: {
  error?: React.ReactNode;
  className?: string;
  /** The save button, then "Cancel". */
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-(--tab-bar-height,0px) z-10 flex flex-col gap-2 border-t bg-surface/80 px-4 py-3 backdrop-blur sm:px-6",
        className,
      )}
    >
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** The one save button of the page, and "Cancel", in a `SaveBar`. */
export function PageSaveBar() {
  const { m } = useI18n();
  const page = use(PageSaveContext);
  if (!page) return null;
  const { saving, failed, dirty, saveAndLeave, saveAll, savedHref } = page;

  return (
    <SaveBar error={failed && !saving ? m.common.form.notAllSaved : null}>
      <Button type="button" onClick={saveAndLeave} disabled={saving}>
        {saving && <LoaderCircleIcon className="animate-spin" />}
        {saving ? m.common.actions.saving : m.common.actions.saveChanges}
      </Button>
      <Link href={savedHref} className={buttonVariants({ variant: "outline" })}>
        {m.common.actions.cancel}
      </Link>
      {/* Also while the page saves: a navigation then would lose the running uploads. */}
      <SaveAllLeaveGuard dirty={dirty} save={saveAll} />
    </SaveBar>
  );
}

/**
 * Registers a form with the save button of the page. The form has changes
 * when its fields differ from their values at the start or after its last
 * save, or when `changed` is true, e.g. pages that the form keeps in its
 * state. `save` saves the form and gives true after a success. Without a
 * `PageSave` around it, a submit saves only this form. Enter in a
 * single-line field saves the page, also when the form has no submit button.
 */
export function usePageSaveForm({
  formRef,
  save,
  changed = false,
  enabled = true,
  leaves = false,
  validate,
}: {
  formRef: React.RefObject<HTMLFormElement | null>;
  save: (form: HTMLFormElement) => Promise<boolean>;
  changed?: boolean;
  /** False: the form saves itself, also inside a `PageSave`. */
  enabled?: boolean;
  /** After a save of this form, the page leaves (see `PageSave`). */
  leaves?: boolean;
  /**
   * Checks the values before the page saves any form, after the checks of the
   * browser, and shows the errors. Gives false to stop the save, e.g. for a
   * file that is too large.
   */
  validate?: (form: HTMLFormElement) => boolean;
}) {
  const context = use(PageSaveContext);
  const page = enabled ? context : null;
  const reveal = use(RevealContext);
  const id = useId();
  const baseline = useRef<string | null>(null);
  const [fieldsChanged, setFieldsChanged] = useState(false);
  // After a save: the values of the fields count as saved after React shows
  // them, e.g. a chart that the server converted.
  const [savedCount, setSavedCount] = useState(0);
  const dirty = fieldsChanged || changed;
  const changedRef = useRef(changed);
  const saveRef = useRef(save);
  const validateRef = useRef(validate);
  const revealRef = useRef(reveal);
  const pageRef = useRef(page);
  useEffect(() => {
    revealRef.current = reveal;
    changedRef.current = changed;
    saveRef.current = save;
    validateRef.current = validate;
    pageRef.current = page;
  });

  /** Compares the fields with their saved values again, e.g. after a change that sends no event. */
  const recheck = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const now = snapshot(form);
    baseline.current ??= now;
    setFieldsChanged(now !== baseline.current);
  }, [formRef]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    baseline.current = snapshot(form);
    // After React showed the change, e.g. a removed tag.
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recheck);
    };
    for (const type of RECHECK_EVENTS) form.addEventListener(type, schedule);
    // Enter in a single-line field: the browser submits a form only with a
    // submit button or one field, so the page saves here. Not from a control
    // that uses Enter itself, e.g. the tag field, which stops the default. On
    // the document: its listener runs after the handlers of React.
    const submitOnEnter = (event: KeyboardEvent) => {
      const page = pageRef.current;
      if (!page || event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) ||
        target.form !== form ||
        NO_ENTER_SUBMIT.has(target.type)
      )
        return;
      event.preventDefault();
      page.saveAndLeave();
    };
    const document = form.ownerDocument;
    document.addEventListener("keydown", submitOnEnter);
    return () => {
      cancelAnimationFrame(frame);
      for (const type of RECHECK_EVENTS) form.removeEventListener(type, schedule);
      document.removeEventListener("keydown", submitOnEnter);
    };
  }, [formRef, recheck]);

  // After React showed a save, e.g. a chart that the server converted: the
  // fields as they are now are the saved values.
  useEffect(() => {
    const form = formRef.current;
    if (savedCount === 0 || !form) return;
    baseline.current = snapshot(form);
    const frame = requestAnimationFrame(recheck);
    return () => cancelAnimationFrame(frame);
  }, [savedCount, formRef, recheck]);

  useEffect(() => {
    if (!page) return;
    return page.register(id, {
      element: () => formRef.current,
      // The fields now, not `dirty`: it shows a change only after the next frame, e.g. a paste and then Enter.
      isDirty: () => {
        const form = formRef.current;
        return (
          changedRef.current ||
          (form !== null && baseline.current !== null && snapshot(form) !== baseline.current)
        );
      },
      validate: () => {
        const form = formRef.current;
        if (!form) return true;
        if (!form.checkValidity()) {
          // A closed part opens first: the browser shows the message only on a visible field.
          const reveal = revealRef.current;
          if (reveal) {
            reveal();
            requestAnimationFrame(() => form.reportValidity());
          } else form.reportValidity();
          return false;
        }
        const valid = validateRef.current?.(form) ?? true;
        if (!valid) revealRef.current?.();
        return valid;
      },
      save: async () => {
        const form = formRef.current;
        // The form is gone, e.g. closed during the save: its changes are not saved.
        if (!form) return false;
        const saved = await saveRef.current(form);
        // The error shows in the form: a closed part opens.
        if (!saved) revealRef.current?.();
        if (saved) {
          baseline.current = snapshot(form);
          setFieldsChanged(false);
          setSavedCount((count) => count + 1);
        }
        return saved;
      },
      leaves,
    });
    // `register` and `setDirty` do not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.register, id, formRef, leaves]);

  const setDirty = page?.setDirty;
  useEffect(() => {
    setDirty?.(id, dirty);
  }, [setDirty, id, dirty]);

  /** Enter in a field: the page saves all its forms. */
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (page) page.saveAndLeave();
    else void save(event.currentTarget);
  }

  return { onSubmit, recheck, dirty, inPageSave: page !== null };
}

/** Opens the closed part of a form, e.g. the edit form of a list row (see `KeptPanel`). */
const RevealContext = createContext<(() => void) | null>(null);

/**
 * The state of a `KeptPanel`: whether it opened once, and its key. `discard`
 * makes the panel new, so its changes are gone, e.g. with "Cancel".
 */
export function useKeptPanel(open: boolean) {
  const [opened, setOpened] = useState(open);
  const [key, setKey] = useState(0);
  if (open && !opened) setOpened(true);
  return { opened, key, discard: () => setKey((current) => current + 1) };
}

/**
 * The edit part of a list row, e.g. the edit form of a link. After its first
 * opening it stays mounted, also while it is closed: its changes wait for the
 * save button of the page, and the leave guard knows them. Only `discard` of
 * `useKeptPanel` removes them. When a form in it fails, `onOpen` opens it, so
 * the error shows.
 */
export function KeptPanel({
  panel,
  open,
  onOpen,
  className,
  children,
}: {
  panel: ReturnType<typeof useKeptPanel>;
  open: boolean;
  onOpen: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (!panel.opened) return null;
  return (
    <RevealContext value={onOpen}>
      <div key={panel.key} hidden={!open} className={className}>
        {children}
      </div>
    </RevealContext>
  );
}

/** While a form saves: a spinner and `pendingLabel`. After a failure: the error of the form. */
export function SaveStatus({
  state,
  pending,
  pendingLabel,
}: {
  state: FormState;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {pending && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-muted">
          <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
          {pendingLabel}
        </p>
      )}
      {!pending && state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

const RECHECK_EVENTS = ["input", "change", "click", "keyup"] as const;

/** Inputs where Enter does not submit a form. */
const NO_ENTER_SUBMIT = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * The values of the fields of a form, to compare. A file counts by its name,
 * size and date. An empty file field counts as empty: its `File` gets the
 * time of each call as its date.
 */
function snapshot(form: HTMLFormElement): string {
  return JSON.stringify(
    [...new FormData(form).entries()].map(([name, value]) => [
      name,
      typeof value === "string"
        ? value
        : value.name === "" && value.size === 0
          ? ""
          : `${value.name}|${value.size}|${value.lastModified}`,
    ]),
  );
}

function without(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) return ids;
  const next = new Set(ids);
  next.delete(id);
  return next;
}

function documentOrder(a: HTMLElement | null, b: HTMLElement | null): number {
  if (!a || !b || a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

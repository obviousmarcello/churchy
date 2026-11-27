"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  CalendarIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  MegaphoneIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { ConfirmActionButton } from "@/components/music/confirm-action-button";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { invalidatePageCache } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { Textarea } from "@/components/music/ui/textarea";
import { useI18n } from "@/i18n/music/client";
import type { I18n } from "@/i18n/music/i18n";
import {
  formatDays,
  formatRange,
  formatWhen,
  groupHeadings,
} from "@/lib/music/announcements/present";
import {
  activeCalendarIds,
  ANNOUNCEMENT_LIMITS,
  calendarEntryKey,
  SECTION_IDS,
  type AnnouncementDTO,
  type AnnouncementEntryDTO,
  type AnnouncementSettingsInput,
  type EntrySettings,
  type EntrySettingsInput,
  type EventAnnouncementsDTO,
  type ManualEntryInput,
  type SectionId,
} from "@/lib/music/announcements/schema";
import {
  buildAnnouncementView,
  weekGroups,
  type AnnouncementView,
  type ViewEntry,
} from "@/lib/music/announcements/sections";
import { churchDay, churchWallTime, fromChurchWallTime } from "@/lib/music/church-time";
import { changedPages } from "@/lib/music/page-keys";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import { toastError, toastSuccess } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";
import type { EntryTarget } from "@/server/music/models/announcements";
import {
  copyAnnouncementAction,
  createAnnouncementAction,
  listAnnouncementSourcesAction,
  refreshAnnouncementAction,
  removeEntryAction,
  saveEntrySettingsAction,
  saveManualEntryAction,
  setEntryAttachmentAction,
  updateAnnouncementAction,
} from "./announcement-actions-client";
import { AttachmentUploadButton, useAttachmentUpload } from "./event-image-upload";
import { ImageItemImages } from "./image-item";

// An announcements item of an event (see `src/lib/announcements/`): under its
// title, the number of its entries and the titles of the highlighted ones.
// The event admins open the editor in a dialog: the settings of the item, and
// the entries in their sections, each with its settings, its QR code and its
// attachment. Each change saves at once; the dialog shows it before the save
// ends, and goes back when the save fails.

/** What the views of an announcements item need from the page of the event. */
export type AnnouncementContext = {
  eventId: string;
  eventStartsAt: string;
  eventEndsAt: string;
  data: EventAnnouncementsDTO;
  imageSets: EventImageSetsDTO;
  look: ProjectionLook;
};

/** The view of an announcement, as the projection shows it at the start of the event. */
function useView(
  context: AnnouncementContext,
  announcement: AnnouncementDTO | undefined,
): AnnouncementView | null {
  return useMemo(
    () =>
      announcement
        ? buildAnnouncementView({
            announcement,
            eventStartsAt: context.eventStartsAt,
            calendarIds: activeCalendarIds(announcement, context.data.calendars),
            excludeWords: context.data.excludeWords,
          })
        : null,
    [announcement, context.eventStartsAt, context.data.calendars, context.data.excludeWords],
  );
}

/** The button that adds an announcements item, next to the field that adds the items. */
export function AddAnnouncementsButton({
  eventId,
  disabled,
  onCreated,
}: {
  eventId: string;
  disabled: boolean;
  onCreated: (id: string) => void;
}) {
  const { m } = useI18n();
  const t = m.announcements.editor;
  const [adding, startAdding] = useTransition();

  function add() {
    startAdding(async () => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await createAnnouncementAction(eventId);
        if (result.status === "error") toastError(result.message || t.addFailed);
        else onCreated(result.id);
      } catch {
        toastError(t.addFailed);
      }
    });
  }

  const label = adding ? t.adding : t.add;
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || adding}
      onClick={add}
      aria-label={label}
      title={label}
      className="shrink-0"
    >
      {adding ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <MegaphoneIcon />}
    </Button>
  );
}

/** The summary of an announcements item, and for the event admins its editor. */
export function AnnouncementItem({
  context,
  announcementId,
  title,
  editable,
  className,
}: {
  context: AnnouncementContext;
  announcementId: string;
  /** The title of the item. */
  title: string;
  editable: boolean;
  className?: string;
}) {
  const { m, plural } = useI18n();
  const t = m.announcements;
  const announcement = context.data.announcements[announcementId];
  const view = useView(context, announcement);
  const [open, setOpen] = useState(false);

  if (!announcement || !view) {
    return (
      <p className={cn("flex items-center gap-1.5 text-sm text-muted", className)}>
        <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
        {t.editor.refreshing}
      </p>
    );
  }

  const listed = view.sections.reduce((sum, section) => sum + section.entries.length, 0);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* The summary and the edit button on one line; the button goes below when the line is too narrow. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {listed === 0 && view.own.length === 0 ? (
          <p className="text-sm text-muted">{t.item.empty}</p>
        ) : (
          <p className="text-sm text-muted">
            {[
              listed > 0 && plural(t.item.entries, listed),
              view.own.length > 0 && plural(t.item.own, view.own.length),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {editable && (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PencilIcon />
            {t.editor.edit}
          </Button>
        )}
      </div>
      {view.own.length > 0 && (
        <ul aria-label={t.item.highlighted} className="flex flex-wrap gap-1.5">
          {view.own.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
            >
              <StarIcon aria-hidden className="size-3 fill-current text-primary" />
              {entry.title}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
              <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
              <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-4xl")}>
                <DialogHeader className="flex-row items-start">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Dialog.Title className="font-heading text-lg font-semibold tracking-tight break-words">
                      {title}
                    </Dialog.Title>
                    <Dialog.Description className="text-sm text-muted">
                      {t.editor.editDescription}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.editor.close}
                      />
                    }
                  >
                    <XIcon />
                  </Dialog.Close>
                </DialogHeader>
                <DialogBody>
                  <AnnouncementEditor context={context} announcement={announcement} />
                </DialogBody>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </>
      )}
    </div>
  );
}

/** A change of an entry that waits for its save, by the key of the entry. */
type Pending = {
  settings: Record<string, Partial<EntrySettings>>;
  announcement: AnnouncementSettingsInput;
};

const NO_PENDING: Pending = { settings: {}, announcement: {} };

/** The announcement with the changes that wait for their saves. */
function withPending(announcement: AnnouncementDTO, pending: Pending): AnnouncementDTO {
  const { calendarIds, showTime, showLocation, showDescription } = pending.announcement;
  const keys = new Set(Object.keys(pending.settings));
  const entries = announcement.entries.map((entry) => {
    const key = entry.source === "calendar" ? calendarEntryKey(entry) : `manual:${entry.id}`;
    keys.delete(key);
    return pending.settings[key]
      ? ({ ...entry, ...pending.settings[key] } as AnnouncementEntryDTO)
      : entry;
  });
  // A calendar entry without settings yet.
  for (const key of keys) {
    if (key.startsWith("manual:")) continue;
    const [calendarId, uid, occurrence] = JSON.parse(key) as [string, string, string];
    entries.push({
      id: `pending:${key}`,
      highlighted: false,
      excluded: false,
      showTime: null,
      showLocation: null,
      showDescription: null,
      attachmentSetId: null,
      qrText: null,
      qrCaption: null,
      textFirst: false,
      ...pending.settings[key],
      source: "calendar",
      calendarId,
      uid,
      occurrence,
    });
  }
  return {
    ...announcement,
    ...(calendarIds !== undefined && { calendarIds }),
    ...(showTime !== undefined && { showTime }),
    ...(showLocation !== undefined && { showLocation }),
    ...(showDescription !== undefined && { showDescription }),
    entries,
  };
}

function targetOf(entry: ViewEntry): EntryTarget {
  if (entry.entryId && !entry.entryId.startsWith("pending:")) return { entryId: entry.entryId };
  const [calendarId, uid, occurrence] = JSON.parse(entry.key) as [string, string, string];
  return { calendarId, uid, occurrence };
}

function AnnouncementEditor({
  context,
  announcement: saved,
}: {
  context: AnnouncementContext;
  announcement: AnnouncementDTO;
}) {
  const i18n = useI18n();
  const { m, format, locale } = i18n;
  const t = m.announcements.editor;
  const [pending, setPending] = useState<Pending>(NO_PENDING);
  // A new announcement from the server has the saved changes.
  const [pendingOf, setPendingOf] = useState(saved);
  if (pendingOf !== saved) {
    setPendingOf(saved);
    setPending(NO_PENDING);
  }
  const announcement = useMemo(() => withPending(saved, pending), [saved, pending]);
  const view = useView(context, announcement) as AnnouncementView;
  const [ended] = useState(() => Date.parse(context.eventEndsAt) <= Date.now());
  const imageCount = Object.values(context.imageSets).reduce(
    (sum, images) => sum + images.length,
    0,
  );
  const upload = useAttachmentUpload(context.eventId, imageCount);

  async function run(
    action: () => Promise<{ status: "success" } | { status: "error"; message: string }>,
    undo: () => void,
  ) {
    invalidatePageCache(changedPages.event(context.eventId));
    try {
      const result = await action();
      if (result.status === "error") {
        undo();
        toastError(result.message || t.saveFailed);
      }
    } catch {
      undo();
      toastError(t.saveFailed);
    }
  }

  function changeAnnouncement(input: AnnouncementSettingsInput) {
    setPending((current) => ({ ...current, announcement: { ...current.announcement, ...input } }));
    void run(
      () => updateAnnouncementAction(saved.id, input),
      () => setPending((current) => ({ ...current, announcement: {} })),
    );
  }

  /** Shows the change of the entry until the server has it. */
  function show(entry: ViewEntry, patch: Partial<EntrySettings>): () => void {
    setPending((current) => ({
      ...current,
      settings: { ...current.settings, [entry.key]: { ...current.settings[entry.key], ...patch } },
    }));
    return () =>
      setPending((current) => {
        const settings = { ...current.settings };
        delete settings[entry.key];
        return { ...current, settings };
      });
  }

  function changeEntry(entry: ViewEntry, input: EntrySettingsInput) {
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Partial<EntrySettings>;
    const undo = show(entry, patch);
    void run(() => saveEntrySettingsAction(saved.id, targetOf(entry), input), undo);
  }

  function detach(entry: ViewEntry) {
    const undo = show(entry, { attachmentSetId: null });
    void run(() => setEntryAttachmentAction(saved.id, targetOf(entry), null), undo);
  }

  function attach(entry: ViewEntry, file: File) {
    upload.upload(file, async (setId) => {
      try {
        const result = await setEntryAttachmentAction(saved.id, targetOf(entry), setId);
        if (result.status === "error") toastError(result.message);
        return result.status === "success";
      } catch {
        return false;
      }
    });
  }

  const empty =
    view.sections.every((section) => section.entries.length === 0) && view.undated.length === 0;
  // As on the slides: the groups of "Next week" when its entries are in more than one.
  const groups = weekGroups(view.sections[0]!).filter((group) => group.entries.length > 0);
  const groupTitles = groupHeadings(m.project.announcements.groups, view.eventDay, i18n);
  const entryProps = {
    context,
    announcement,
    upload,
    onChange: changeEntry,
    onAttach: attach,
    onDetach: detach,
  };

  return (
    <div className="flex flex-col gap-8">
      <Settings
        context={context}
        announcement={announcement}
        ended={ended}
        onChange={changeAnnouncement}
      />

      {empty && (
        <Empty className="rounded-lg border p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarIcon />
            </EmptyMedia>
            <EmptyTitle>{t.noEntries.title}</EmptyTitle>
            <EmptyDescription>{t.noEntries.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!empty &&
        view.sections.map((section) => (
          <section
            key={section.id}
            aria-label={sectionTitle(i18n, announcement, section.id)}
            className="flex flex-col gap-2"
          >
            <h3 className="flex flex-wrap items-baseline gap-x-2 font-medium">
              {sectionTitle(i18n, announcement, section.id)}
              {section.from <= section.to && (
                <span className="text-sm font-normal text-muted">
                  {formatRange(locale, section.from, section.to)}
                </span>
              )}
            </h3>
            {section.entries.length === 0 ? (
              <p className="text-sm text-muted">{t.emptySection}</p>
            ) : groups.length > 1 && section.id === "nextWeek" ? (
              groups.map((group) => (
                <div key={group.id} className="flex flex-col gap-1">
                  <h4 className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                    {groupTitles[group.id]}
                    <span className="font-normal text-muted">
                      {formatDays(locale, group.from, group.to)}
                    </span>
                  </h4>
                  <ul className="divide-y rounded-lg border">
                    {group.entries.map((entry) => (
                      <EntryRow key={entry.key} entry={entry} {...entryProps} />
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <ul className="divide-y rounded-lg border">
                {section.entries.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} {...entryProps} />
                ))}
              </ul>
            )}
          </section>
        ))}

      {view.undated.length > 0 && (
        <section aria-label={t.undated} className="flex flex-col gap-2">
          <h3 className="font-medium">{t.undated}</h3>
          <p className="text-sm text-muted">{t.undatedHint}</p>
          <ul className="divide-y rounded-lg border">
            {view.undated.map((entry) => (
              <EntryRow key={entry.key} entry={entry} {...entryProps} />
            ))}
          </ul>
        </section>
      )}

      <ManualEntryForm
        announcementId={saved.id}
        eventId={context.eventId}
        eventStartsAt={context.eventStartsAt}
        entry={null}
      />

      {view.excluded.length > 0 && (
        <details className="group flex flex-col gap-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium">
            <ChevronDownIcon
              aria-hidden
              className="size-4 -rotate-90 transition-transform group-open:rotate-0"
            />
            {format(t.excluded, { count: view.excluded.length })}
          </summary>
          <ul className="mt-2 divide-y rounded-lg border">
            {view.excluded.map((entry) => (
              <EntryRow key={entry.key} entry={entry} {...entryProps} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function sectionTitle({ m }: I18n, announcement: AnnouncementDTO, id: SectionId): string {
  return announcement.titles[id] ?? m.project.announcements[id];
}

function Settings({
  context,
  announcement,
  ended,
  onChange,
}: {
  context: AnnouncementContext;
  announcement: AnnouncementDTO;
  ended: boolean;
  onChange: (input: AnnouncementSettingsInput) => void;
}) {
  const i18n = useI18n();
  const { m, format, locale } = i18n;
  const t = m.announcements.editor;
  const id = useId();
  const [refreshing, startRefresh] = useTransition();
  const { calendars } = context.data;
  const chosen = new Set(announcement.calendarIds ?? calendars.map((calendar) => calendar.id));

  function toggleCalendar(calendarId: string, on: boolean) {
    const ids = calendars
      .filter((calendar) => (calendar.id === calendarId ? on : chosen.has(calendar.id)))
      .map((calendar) => calendar.id);
    // All calendars: also the ones that a superadmin adds later.
    onChange({ calendarIds: ids.length === calendars.length ? null : ids });
  }

  function refresh() {
    startRefresh(async () => {
      invalidatePageCache(changedPages.event(context.eventId));
      try {
        const result = await refreshAnnouncementAction(announcement.id);
        if (result.status === "error") toastError(result.message || t.refreshFailed);
      } catch {
        toastError(t.refreshFailed);
      }
    });
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const problems = calendars.flatMap((calendar) => {
    const status = announcement.calendarStatus[calendar.id];
    if (!status?.error || !activeCalendarIds(announcement, calendars).has(calendar.id)) return [];
    const reason = reasonText(i18n, status.error);
    return [
      status.refreshedAt
        ? format(t.calendarFailed, { name: calendar.name, reason, time: time(status.refreshedAt) })
        : format(t.calendarNeverRead, { name: calendar.name, reason }),
    ];
  });

  return (
    <section aria-label={t.settingsHeading} className="flex flex-col gap-5 rounded-lg border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t.calendars}</legend>
        {calendars.length === 0 ? (
          <p className="text-sm text-muted">{t.noCalendars}</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {calendars.map((calendar) => (
              <label key={calendar.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={chosen.has(calendar.id)}
                  onChange={(event) => toggleCalendar(calendar.id, event.target.checked)}
                />
                {calendar.enabled ? calendar.name : format(t.calendarOff, { name: calendar.name })}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.details}</legend>
        <p className="text-sm text-muted">{t.detailsHint}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(
            [
              ["showTime", t.time],
              ["showLocation", t.location],
              ["showDescription", t.description],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={announcement[key]}
                onChange={(event) => onChange({ [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t.sectionTitles}</legend>
        <p className="text-sm text-muted">{t.sectionTitlesHint}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {SECTION_IDS.map((section) => (
            <div key={section} className="flex flex-col gap-1">
              <Label htmlFor={`${id}-${section}`} className="text-xs text-muted">
                {t[section]}
              </Label>
              <SavedInput
                id={`${id}-${section}`}
                value={announcement.titles[section] ?? ""}
                placeholder={m.project.announcements[section]}
                maxLength={ANNOUNCEMENT_LIMITS.sectionTitle}
                onSave={(value) => onChange({ titles: { [section]: value } })}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">
            {ended
              ? t.ended
              : announcement.refreshedAt
                ? format(t.refreshedAt, { time: time(announcement.refreshedAt) })
                : t.neverRefreshed}
          </p>
          {!ended && calendars.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
              {refreshing ? t.refreshing : t.refresh}
            </Button>
          )}
          <CopyFrom eventId={context.eventId} announcementId={announcement.id} />
        </div>
        {problems.map((problem) => (
          <p key={problem} role="status" className="flex items-start gap-1.5 text-sm text-danger">
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {problem}
          </p>
        ))}
      </div>
    </section>
  );
}

function reasonText({ m, format }: I18n, error: string): string {
  const reasons = m.announcements.editor.reasons;
  if (error.startsWith("http_")) return format(reasons.http, { status: error.slice(5) });
  if (error === "too_large") return reasons.tooLarge;
  if (error === "too_many") return reasons.tooMany;
  if (
    error === "timeout" ||
    error === "network" ||
    error === "parse" ||
    error === "blocked" ||
    error === "redirects"
  )
    return reasons[error];
  return reasons.other;
}

/** A text field that saves when it loses the focus or with Enter. An empty text saves null. */
function SavedInput({
  id,
  value,
  placeholder,
  maxLength,
  onSave,
  className,
  disabled,
}: {
  id: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  onSave: (value: string | null) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  // A new saved value replaces the text.
  const [textOf, setTextOf] = useState(value);
  if (textOf !== value) {
    setTextOf(value);
    setText(value);
  }

  function save() {
    const trimmed = text.trim();
    if (trimmed !== value) onSave(trimmed || null);
  }

  return (
    <Input
      id={id}
      value={text}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(event) => setText(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        }
      }}
      className={className}
      disabled={disabled}
    />
  );
}

function EntryRow({
  entry,
  context,
  announcement,
  upload,
  onChange,
  onAttach,
  onDetach,
}: {
  entry: ViewEntry;
  context: AnnouncementContext;
  announcement: AnnouncementDTO;
  upload: ReturnType<typeof useAttachmentUpload>;
  onChange: (entry: ViewEntry, input: EntrySettingsInput) => void;
  onAttach: (entry: ViewEntry, file: File) => void;
  onDetach: (entry: ViewEntry) => void;
}) {
  const i18n = useI18n();
  const { m, format, locale } = i18n;
  const t = m.announcements.editor;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { settings } = entry;
  const when = formatWhen(entry, true, locale);
  const calendar = context.data.calendars.find((candidate) => candidate.id === entry.calendarId);
  const undated = entry.source === "manual" && entry.start === null;
  const manualRow =
    entry.source === "manual"
      ? announcement.entries.find((row) => row.id === entry.entryId)
      : undefined;
  const hasSettings =
    entry.source === "calendar" && entry.entryId !== null && !entry.entryId.startsWith("pending:");
  const attachmentImages = settings.attachmentSetId
    ? (context.imageSets[settings.attachmentSetId] ?? [])
    : [];
  const uploading = upload.progress !== null;

  if (editing && manualRow?.source === "manual") {
    return (
      <li className="p-3">
        <ManualEntryForm
          announcementId={announcement.id}
          eventId={context.eventId}
          eventStartsAt={context.eventStartsAt}
          entry={manualRow}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "font-medium break-words",
              entry.highlighted && "text-primary",
              entry.excludedBy && "text-muted line-through",
            )}
          >
            {entry.title}
          </span>
          <span className="text-sm text-muted">
            {[when, entry.location, calendar?.name ?? (entry.source === "manual" ? t.own : null)]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {entry.excludedBy === "word" && (
            <span className="text-xs text-muted">{t.excludedByWord}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!undated && (
            <Button
              type="button"
              variant={settings.highlighted ? "secondary" : "ghost"}
              size="icon-sm"
              aria-pressed={settings.highlighted}
              aria-label={t.highlight}
              title={`${t.highlight}: ${t.highlightHint}`}
              onClick={() => onChange(entry, { highlighted: !settings.highlighted })}
            >
              <StarIcon className={cn(settings.highlighted && "fill-current text-primary")} />
            </Button>
          )}
          {entry.excludedBy !== "word" && !undated && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={settings.excluded ? t.include : t.exclude}
              title={settings.excluded ? t.include : t.exclude}
              onClick={() => onChange(entry, { excluded: !settings.excluded })}
            >
              {settings.excluded ? <EyeIcon /> : <EyeOffIcon />}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={`${id}-settings`}
            aria-label={format(t.settingsOf, { title: entry.title })}
            title={t.settings}
            onClick={() => setOpen(!open)}
          >
            <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      {open && (
        <div id={`${id}-settings`} className="flex flex-col gap-4 rounded-md bg-surface-sunken p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["showTime", t.time, announcement.showTime],
                ["showLocation", t.location, announcement.showLocation],
                ["showDescription", t.description, announcement.showDescription],
              ] as const
            ).map(([key, label, fallback]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label htmlFor={`${id}-${key}`} className="text-xs text-muted">
                  {label}
                </Label>
                <NativeSelect
                  id={`${id}-${key}`}
                  value={settings[key] === null ? "default" : settings[key] ? "show" : "hide"}
                  onChange={(event) =>
                    onChange(entry, {
                      [key]:
                        event.target.value === "default" ? null : event.target.value === "show",
                    })
                  }
                >
                  <option value="default">
                    {format(t.detailDefault, { value: fallback ? t.shown : t.hidden })}
                  </option>
                  <option value="show">{t.show}</option>
                  <option value="hide">{t.hide}</option>
                </NativeSelect>
              </div>
            ))}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.qr}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-qr`} className="text-xs text-muted">
                  {t.qrText}
                </Label>
                <SavedInput
                  id={`${id}-qr`}
                  value={settings.qrText ?? ""}
                  placeholder="https://"
                  maxLength={ANNOUNCEMENT_LIMITS.qrText}
                  onSave={(value) => onChange(entry, { qrText: value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-caption`} className="text-xs text-muted">
                  {t.qrCaption}
                </Label>
                <SavedInput
                  id={`${id}-caption`}
                  value={settings.qrCaption ?? ""}
                  placeholder={t.qrCaptionPlaceholder}
                  maxLength={ANNOUNCEMENT_LIMITS.qrCaption}
                  onSave={(value) => onChange(entry, { qrCaption: value })}
                  disabled={!settings.qrText && !settings.qrCaption}
                />
              </div>
            </div>
            {entry.url && entry.url !== settings.qrText && (
              <div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={() => onChange(entry, { qrText: entry.url })}
                >
                  {t.qrUseUrl}
                </Button>
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t.attachment}</legend>
            <p className="text-sm text-muted">{t.attachmentHint}</p>
            {settings.attachmentSetId && (
              <ImageItemImages
                eventId={context.eventId}
                setId={settings.attachmentSetId}
                title={entry.title}
                images={attachmentImages}
                look={context.look}
                progress={
                  upload.progress?.setId === settings.attachmentSetId ? upload.progress : null
                }
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <AttachmentUploadButton
                label={settings.attachmentSetId ? t.replaceAttachment : t.addAttachment}
                upload={upload}
                onFile={(file) => onAttach(entry, file)}
              />
              {settings.attachmentSetId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => onDetach(entry)}
                >
                  <XIcon />
                  {t.removeAttachment}
                </Button>
              )}
            </div>
            {settings.attachmentSetId && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={settings.textFirst}
                  onChange={(event) => onChange(entry, { textFirst: event.target.checked })}
                />
                {t.textFirst}
              </label>
            )}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            {manualRow && (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                <PencilIcon />
                {t.editEntry}
              </Button>
            )}
            {(manualRow || hasSettings) && entry.entryId && (
              <ConfirmActionButton
                id={entry.entryId}
                icon={<Trash2Icon />}
                label={manualRow ? t.remove : t.resetSettings}
                title={format(manualRow ? t.removeTitle : t.resetTitle, { title: entry.title })}
                description={manualRow ? t.removeDescription : t.resetDescription}
                confirmLabel={manualRow ? t.remove : t.resetSettings}
                pendingLabel={t.saving}
                failure={t.saveFailed}
                onConfirm={() => {
                  invalidatePageCache(changedPages.event(context.eventId));
                  return removeEntryAction(announcement.id, entry.entryId as string);
                }}
              />
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** The form of a manual entry: a new one (`entry` null), or a change. */
function ManualEntryForm({
  announcementId,
  eventId,
  eventStartsAt,
  entry,
  onDone,
}: {
  announcementId: string;
  eventId: string;
  eventStartsAt: string;
  entry: Extract<AnnouncementEntryDTO, { source: "manual" }> | null;
  onDone?: () => void;
}) {
  const { m } = useI18n();
  const t = m.announcements.editor;
  const id = useId();
  const eventDay = churchDay(eventStartsAt);
  const [open, setOpen] = useState(entry !== null);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [kind, setKind] = useState<"timed" | "allDay" | "none">(
    entry ? (entry.startsAt ? "timed" : entry.startDate ? "allDay" : "none") : "timed",
  );
  const [start, setStart] = useState(
    entry?.startsAt ? churchWallTime(entry.startsAt) : `${eventDay}T18:00`,
  );
  const [end, setEnd] = useState(entry?.endsAt ? churchWallTime(entry.endsAt) : "");
  const [startDate, setStartDate] = useState(entry?.startDate ?? eventDay);
  const [endDate, setEndDate] = useState(entry?.endDate ?? "");
  const [location, setLocation] = useState(entry?.location ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    onDone?.();
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const startsAt = kind === "timed" ? fromChurchWallTime(start)?.toISOString() : null;
    const endsAt = kind === "timed" && end ? fromChurchWallTime(end)?.toISOString() : null;
    const input: ManualEntryInput = {
      title,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      startDate: kind === "allDay" ? startDate || null : null,
      endDate: kind === "allDay" && endDate ? endDate : null,
      location,
      description,
    };
    startSaving(async () => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await saveManualEntryAction(announcementId, entry?.id ?? null, input);
        if (result.status === "error") {
          setError(result.message || t.saveFailed);
          return;
        }
        toastSuccess(t.save);
        if (!entry) {
          setTitle("");
          setLocation("");
          setDescription("");
        }
        close();
      } catch {
        setError(t.saveFailed);
      }
    });
  }

  if (!open) {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon />
          {t.addEntry}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 rounded-lg border p-3"
      aria-label={entry ? t.editEntry : t.addEntry}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-title`}>{t.entryTitle}</Label>
        <Input
          id={`${id}-title`}
          required
          maxLength={ANNOUNCEMENT_LIMITS.title}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-kind`}>{t.dateKind}</Label>
        <NativeSelect
          id={`${id}-kind`}
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
          className="w-auto"
        >
          <option value="timed">{t.timed}</option>
          <option value="allDay">{t.allDay}</option>
          <option value="none">{t.noDate}</option>
        </NativeSelect>
        {kind === "none" && <p className="text-sm text-muted">{t.undatedHint}</p>}
      </div>
      {kind === "timed" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{t.start}</Label>
            <Input
              id={`${id}-start`}
              type="datetime-local"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-end`}>{t.end}</Label>
            <Input
              id={`${id}-end`}
              type="datetime-local"
              min={start}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
        </div>
      )}
      {kind === "allDay" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start-date`}>{t.startDate}</Label>
            <Input
              id={`${id}-start-date`}
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-end-date`}>{t.endDate}</Label>
            <Input
              id={`${id}-end-date`}
              type="date"
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-location`}>{t.location}</Label>
        <Input
          id={`${id}-location`}
          maxLength={ANNOUNCEMENT_LIMITS.location}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-description`}>{t.description}</Label>
        <Textarea
          id={`${id}-description`}
          maxLength={ANNOUNCEMENT_LIMITS.description}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-16"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? t.saving : t.save}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={close}>
          {t.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Copies the settings and the entries of the announcements of another event. */
function CopyFrom({ eventId, announcementId }: { eventId: string; announcementId: string }) {
  const { m, locale } = useI18n();
  const t = m.announcements.editor;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<
    { announcementId: string; title: string; startsAt: string }[] | null
  >(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function load() {
    setOpen(true);
    setError(null);
    startBusy(async () => {
      try {
        const result = await listAnnouncementSourcesAction(eventId);
        if (result.status === "error") setError(result.message || t.copyFailed);
        else {
          setSources(result.sources);
          setChoice(result.sources[0]?.announcementId ?? "");
        }
      } catch {
        setError(t.copyFailed);
      }
    });
  }

  function copy() {
    startBusy(async () => {
      invalidatePageCache(changedPages.event(eventId));
      try {
        const result = await copyAnnouncementAction(announcementId, choice);
        if (result.status === "error") {
          setError(result.message || t.copyFailed);
          return;
        }
        toastSuccess(t.copied);
        setOpen(false);
      } catch {
        setError(t.copyFailed);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={load}>
        <CopyIcon />
        {t.copyFrom}
      </Button>
      <Dialog.Root open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <Dialog.Portal>
          <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
          <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
            <DialogHeader>
              <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
                {t.copyTitle}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted">
                {t.copyDescription}
              </Dialog.Description>
            </DialogHeader>
            <DialogBody>
              {sources === null ? (
                busy && <LoaderCircleIcon aria-hidden className="size-5 animate-spin text-muted" />
              ) : sources.length === 0 ? (
                <p className="text-sm text-muted">{t.copyEmpty}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${id}-source`} className="sr-only">
                    {t.copyTitle}
                  </Label>
                  <NativeSelect
                    id={`${id}-source`}
                    value={choice}
                    onChange={(event) => setChoice(event.target.value)}
                  >
                    {sources.map((source) => (
                      <option key={source.announcementId} value={source.announcementId}>
                        {`${new Date(source.startsAt).toLocaleDateString(locale, { dateStyle: "medium" })} · ${source.title}`}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <DialogActions>
                <Dialog.Close render={<Button type="button" variant="ghost" disabled={busy} />}>
                  {t.cancel}
                </Dialog.Close>
                <Button type="button" disabled={busy || !choice} onClick={copy}>
                  {busy && sources !== null ? t.copying : t.copy}
                </Button>
              </DialogActions>
            </DialogFooter>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

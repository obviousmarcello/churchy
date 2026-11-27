"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { LocalDateTime } from "@/components/music/local-date-time";
import { useI18n } from "@/i18n/music/client";
import {
  addImageAction,
  addManualEntryAction,
  createAnnouncementAction,
  createImageSetAction,
  excludeEntryAction,
  refreshAnnouncementAction,
  removeEntryAction,
  removeImageAction,
  saveAnnouncementAction,
} from "../media-actions";

type Outcome =
  | { readonly ok: true; readonly value: { ok: boolean; message?: string | null } }
  | { readonly ok: false; readonly status: 403 | 404 };
type Send = (action: (data: FormData) => Promise<Outcome>, data: FormData) => void;

export type ImageSet = { id: string; images: { id: string; name: string; url: string }[] };
export type Announcement = {
  id: string;
  calendarIds: string[] | null;
  refreshedAt: string | null;
  snapshot: { calendarId: string; uid: string; occurrence: string; title: string }[];
  excluded: string[];
  manual: { id: string; title: string }[];
};

/** Image sets and announcements of an event (those who edit it; others see the program points only). */
export function MediaPanel({
  eventId,
  imagesOn,
  announcementsOn,
  sets,
  announcements,
  calendars,
}: {
  eventId: string;
  imagesOn: boolean;
  announcementsOn: boolean;
  sets: ImageSet[];
  announcements: Announcement[];
  calendars: { id: string; name: string; enabled: boolean }[];
}) {
  const { m } = useI18n();
  const t = m.events.media;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send: Send = (action, data) => {
    data.set("id", eventId);
    start(async () => {
      const result = await action(data);
      setError(
        !result.ok || !result.value.ok
          ? (result.ok ? result.value.message : null) || t.failed
          : null,
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {imagesOn && (
        <section className="flex flex-col gap-3" aria-labelledby="images-h">
          <h2 id="images-h" className="text-lg font-semibold">
            {t.imagesTitle}
          </h2>
          {sets.length === 0 && <p className="text-sm text-muted">{t.imagesEmpty}</p>}
          {sets.map((set) => (
            <div key={set.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <ul className="flex flex-wrap gap-2">
                {set.images.map((image) => (
                  <li key={image.id} className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a private, already resized file */}
                    <img
                      src={image.url}
                      alt={image.name}
                      className="h-20 w-32 rounded object-cover"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        const data = new FormData();
                        data.set("imageId", image.id);
                        send(removeImageAction, data);
                      }}
                    >
                      {t.removeImage}
                    </Button>
                  </li>
                ))}
              </ul>
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  data.set("setId", set.id);
                  send(addImageAction, data);
                  event.currentTarget.reset();
                }}
              >
                <Label htmlFor={`file-${set.id}`}>{t.upload}</Label>
                <input id={`file-${set.id}`} name="file" type="file" accept="image/*" required />
                <Input
                  name="name"
                  maxLength={100}
                  placeholder={t.imageName}
                  aria-label={t.imageName}
                />
                <Button type="submit" variant="outline" disabled={pending} className="self-start">
                  {t.upload}
                </Button>
              </form>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(createImageSetAction, new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <Input name="title" maxLength={200} placeholder={t.setTitle} aria-label={t.setTitle} />
            <Button type="submit" variant="outline" disabled={pending}>
              {t.newSet}
            </Button>
          </form>
        </section>
      )}

      {announcementsOn && (
        <section className="flex flex-col gap-3" aria-labelledby="ann-h">
          <h2 id="ann-h" className="text-lg font-semibold">
            {t.announcementsTitle}
          </h2>
          {announcements.length === 0 && (
            <p className="text-sm text-muted">{t.announcementsEmpty}</p>
          )}
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              calendars={calendars}
              pending={pending}
              send={send}
            />
          ))}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(createAnnouncementAction, new FormData(event.currentTarget));
              event.currentTarget.reset();
            }}
          >
            <Input
              name="title"
              maxLength={200}
              placeholder={t.announcementTitle}
              aria-label={t.announcementTitle}
            />
            <Button type="submit" variant="outline" disabled={pending}>
              {t.newAnnouncement}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement,
  calendars,
  pending,
  send,
}: {
  announcement: Announcement;
  calendars: { id: string; name: string; enabled: boolean }[];
  pending: boolean;
  send: Send;
}) {
  const { m } = useI18n();
  const t = m.events.media;
  const chosen = announcement.calendarIds;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          data.set("announcementId", announcement.id);
          data.set("refresh", "on");
          send(saveAnnouncementAction, data);
        }}
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{t.calendars}</legend>
          {calendars.filter((calendar) => calendar.enabled).length === 0 && (
            <p className="text-sm text-muted">{t.noCalendars}</p>
          )}
          {calendars
            .filter((calendar) => calendar.enabled)
            .map((calendar) => (
              <label key={calendar.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="calendarId"
                  value={calendar.id}
                  defaultChecked={chosen === null || chosen.includes(calendar.id)}
                />
                {calendar.name}
              </label>
            ))}
        </fieldset>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending}>
            {t.save}
          </Button>
          <span className="text-sm text-muted">
            {announcement.refreshedAt ? (
              <>
                {t.lastRead.split("{time}")[0]}
                <LocalDateTime
                  date={announcement.refreshedAt}
                  options={{ dateStyle: "medium", timeStyle: "short" }}
                />
              </>
            ) : (
              t.never
            )}
          </span>
        </div>
      </form>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        className="self-start"
        onClick={() => {
          const data = new FormData();
          data.set("announcementId", announcement.id);
          send(refreshAnnouncementAction, data);
        }}
      >
        {t.refresh}
      </Button>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t.entries}</h3>
        {announcement.snapshot.length === 0 && announcement.manual.length === 0 && (
          <p className="text-sm text-muted">{t.noEntries}</p>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {announcement.snapshot.map((entry) => {
            const key = `${entry.calendarId}|${entry.uid}|${entry.occurrence}`;
            const excluded = announcement.excluded.includes(key);
            return (
              <li key={key} className="flex items-center justify-between gap-2">
                <span className={excluded ? "text-muted line-through" : undefined}>
                  {entry.title}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const data = new FormData();
                    data.set("announcementId", announcement.id);
                    data.set("calendarId", entry.calendarId);
                    data.set("uid", entry.uid);
                    data.set("occurrence", entry.occurrence);
                    data.set("excluded", String(!excluded));
                    send(excludeEntryAction, data);
                  }}
                >
                  {excluded ? t.include : t.exclude}
                </Button>
              </li>
            );
          })}
          {announcement.manual.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span>{entry.title}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const data = new FormData();
                  data.set("announcementId", announcement.id);
                  data.set("entryId", entry.id);
                  send(removeEntryAction, data);
                }}
              >
                {t.removeEntry}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          data.set("announcementId", announcement.id);
          send(addManualEntryAction, data);
          event.currentTarget.reset();
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor={`m-title-${announcement.id}`}>{t.manualTitle}</Label>
          <Input id={`m-title-${announcement.id}`} name="title" required maxLength={200} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`m-date-${announcement.id}`}>{t.manualDate}</Label>
          <Input id={`m-date-${announcement.id}`} name="date" type="date" required />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {t.manualAdd}
        </Button>
      </form>
    </div>
  );
}

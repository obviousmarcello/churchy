"use client";

import Link from "next/link";
import { Fragment } from "react";
import {
  BookOpenIcon,
  FileMusicIcon,
  ImagesIcon,
  ListMusicIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  MusicIcon,
  PresentationIcon,
  RadioIcon,
} from "lucide-react";

import { EditSongButton, type EditSongTarget } from "@/app/munkater/enektar/edit-song-dialog";
import { BlockHeader } from "@/components/music/block-header";
import { KeyName } from "@/components/music/note-names";
import { PlannedDuration, PlannedStart, RunSheetSummary } from "@/components/music/run-sheet";
import { ITEM_ICON_CLASS } from "@/components/music/setlist-rows";
import { buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { NAV_FORWARD } from "@/components/music/page-transition";
import { ModuleGate, useScriptureTranslations } from "@/components/music/app-config";
import { useI18n } from "@/i18n/music/client";
import { blockRuns, runSheetWithBlocks, type EventBlock } from "@/lib/music/event-blocks";
import { itemPlannedSeconds } from "@/lib/music/event-timing";
import { personName } from "@/lib/music/format";
import { eventSheetHref } from "@/lib/music/next-path";
import { resolveTranslation, scriptureTranslation } from "@/lib/music/scripture/translations";
import { cn } from "@/lib/music/utils";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import type { ProjectionLook } from "@/lib/music/projection/themes";
import type { SetlistItemDTO } from "@/server/music/models/setlists";
import { AnnouncementItem, type AnnouncementContext } from "./announcement-item";
import { ImageStrip } from "./image-item";

/**
 * The items of an event in order, read-only: songs with a link to their
 * sheet, and text items, scripture readings, text slides (with the text that
 * the projection shows), image items and announcements items, each with its
 * volunteer. The item that the projection shows now has a mark. When the items
 * have planned times, each item shows its planned start (see `runSheet`).
 * The items of a block have its header before them (see `@/lib/event-blocks`).
 */
export function EventItems({
  eventId,
  items,
  blocks,
  startsAt,
  durationMinutes,
  volunteers,
  imageSets,
  look,
  announcements,
  liveKey = null,
  onEditSong,
}: {
  eventId: string;
  items: SetlistItemDTO[];
  /** The blocks of the items. */
  blocks: EventBlock[];
  /** The start of the event. */
  startsAt: string;
  /** The duration of the event. */
  durationMinutes: number;
  /** The key of the item that the projection shows now, if any. */
  liveKey?: string | null;
  /** The volunteers of the event. */
  volunteers: AvatarPerson[];
  /** The images of the image items, by set. */
  imageSets: EventImageSetsDTO;
  /** The look of the event, for the previews of the images. */
  look: ProjectionLook;
  /** The announcements items, with their calendar entries. */
  announcements: AnnouncementContext;
  /** For song admins: opens a song in the edit dialog. */
  onEditSong?: (target: EditSongTarget) => void;
}) {
  const { m, format } = useI18n();
  const translations = useScriptureTranslations();
  const volunteersById = new Map(volunteers.map((person) => [person.id, person]));
  const seconds = items.map(itemPlannedSeconds);
  // A block with a time of its own takes that time (see `runSheetWithBlocks`).
  const sheet = runSheetWithBlocks(
    startsAt,
    items.map((item, index) => ({
      seconds: seconds[index] ?? null,
      blockKey: item.blockKey ?? null,
    })),
    blocks,
  );
  // Without any time, no planned starts: they would all be the start of the event.
  const timed = sheet.totalSeconds > 0;
  const blocksByKey = new Map(blocks.map((block) => [block.key, block]));
  const blockItems = items.map((item, index) => ({
    blockKey: item.blockKey && blocksByKey.has(item.blockKey) ? item.blockKey : null,
    seconds: seconds[index],
  }));
  const runs = blockRuns(blockItems);
  const runAt = new Map(runs.map((run) => [run.first, run]));
  const inBlock = (index: number) => runs.some((run) => index >= run.first && index <= run.last);
  const lastInBlock = (index: number) => runs.some((run) => index === run.last);

  if (items.length === 0) {
    return (
      <Empty className="rounded-lg border p-6 md:p-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListMusicIcon />
          </EmptyMedia>
          <EmptyTitle>{m.events.items.emptyTitle}</EmptyTitle>
          <EmptyDescription>{m.events.eventItems.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {items.map((item, index) => {
          const run = runAt.get(index);
          const block = run && blocksByKey.get(run.blockKey);
          return (
            <Fragment key={item.id}>
              {block && (
                // The top of the card of the block: its items join it below (as in `SetlistRows`).
                <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-xl border-l-4 border-l-primary/40 bg-surface-sunken px-3 py-2">
                  <BlockHeader block={block} />
                </li>
              )}
              <li
                className={cn(
                  "flex items-start gap-3 rounded-xl border-l-4 border-l-transparent bg-surface-sunken px-3 py-2.5 text-sm",
                  inBlock(index) &&
                    "-mt-2 rounded-none border-t border-l-primary/40 border-t-border",
                  lastInBlock(index) && "rounded-b-xl",
                )}
              >
                {liveKey !== null && item.key === liveKey && (
                  <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">
                    <RadioIcon aria-hidden className="size-3" />
                    {m.components.setlistRows.live}
                  </span>
                )}
                <span className="w-6 shrink-0 py-1.5 text-right text-muted tabular-nums">
                  {index + 1}.
                </span>
                {timed && (
                  <span className="flex min-w-12 shrink-0 flex-col items-end py-0.5">
                    <PlannedStart start={sheet.starts[index]!} />
                    {seconds[index] != null && (
                      <PlannedDuration seconds={seconds[index]!} className="text-xs" />
                    )}
                  </span>
                )}
                {item.kind === "song" ? (
                  <>
                    <span className={ITEM_ICON_CLASS}>
                      <MusicIcon aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col py-0.5">
                      <span className="truncate font-semibold">{item.song.title}</span>
                      <span className="truncate text-xs text-muted">
                        {[item.song.artist, item.arrangement.name].filter(Boolean).join(" · ")}
                      </span>
                      <ItemVolunteer
                        person={item.volunteerId ? volunteersById.get(item.volunteerId) : undefined}
                      />
                    </div>
                    {(item.musicalKey ?? item.arrangement.key) && (
                      <span className="mt-0.5 shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">
                        <span className="sr-only">{m.events.eventItems.keyPrefix}</span>
                        {/* The key of the slot, in the user's note names. */}
                        <KeyName value={item.musicalKey ?? item.arrangement.key ?? ""} />
                      </span>
                    )}
                    {onEditSong && (
                      <EditSongButton
                        title={item.song.title}
                        onClick={() =>
                          onEditSong({ songId: item.song.id, arrangementId: item.arrangement.id })
                        }
                      />
                    )}
                    <ModuleGate id="sheet">
                      <Link
                        href={eventSheetHref(eventId, item.id)}
                        transitionTypes={NAV_FORWARD}
                        aria-label={format(m.events.eventItems.sheetOf, { title: item.song.title })}
                        title={m.events.eventItems.openSheet}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      >
                        <FileMusicIcon />
                      </Link>
                    </ModuleGate>
                  </>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className={ITEM_ICON_CLASS}>
                      {item.scripture ? (
                        <BookOpenIcon aria-hidden />
                      ) : item.announcementId ? (
                        <MegaphoneIcon aria-hidden />
                      ) : item.imageSetId ? (
                        <ImagesIcon aria-hidden />
                      ) : item.textSlide ? (
                        <PresentationIcon aria-hidden />
                      ) : (
                        <MessageSquareTextIcon aria-hidden />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col py-0.5">
                      <span className="font-semibold break-words">
                        {item.scripture && (
                          <span className="sr-only">{m.events.eventItems.scripturePrefix}</span>
                        )}
                        {item.title}
                        {item.scripture && (
                          <span className="font-normal text-muted">
                            {m.common.separator}
                            {
                              (
                                resolveTranslation(item.scriptureTranslation, translations) ??
                                scriptureTranslation(item.scriptureTranslation)
                              ).shortName
                            }
                          </span>
                        )}
                      </span>
                      {item.description && (
                        <p className="break-words whitespace-pre-line">{item.description}</p>
                      )}
                      {item.highlight && (
                        <p className="font-semibold break-words whitespace-pre-line">
                          {item.highlight}
                        </p>
                      )}
                      {item.notes && (
                        <p className="break-words whitespace-pre-line text-muted">{item.notes}</p>
                      )}
                      {item.imageSetId && (
                        <ImageStrip
                          images={imageSets[item.imageSetId] ?? []}
                          look={look}
                          className="mt-1"
                        />
                      )}
                      {item.announcementId && (
                        <AnnouncementItem
                          context={announcements}
                          announcementId={item.announcementId}
                          title={item.title}
                          editable={false}
                          className="mt-1"
                        />
                      )}
                      <ItemVolunteer
                        person={item.volunteerId ? volunteersById.get(item.volunteerId) : undefined}
                      />
                    </div>
                  </div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      <RunSheetSummary
        sheet={sheet}
        startsAt={startsAt}
        durationMinutes={durationMinutes}
        admin={false}
      />
    </div>
  );
}

function ItemVolunteer({ person }: { person: AvatarPerson | undefined }) {
  const i18n = useI18n();
  const { m } = i18n;
  if (!person) return null;
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1.5">
      <UserAvatar person={person} size="sm" className="size-5" />
      <span className="truncate">
        <span className="sr-only">{m.events.eventItems.volunteerPrefix}</span>
        {personName(person, i18n)}
      </span>
    </span>
  );
}

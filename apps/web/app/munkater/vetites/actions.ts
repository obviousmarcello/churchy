"use server";

import type { I18n } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import type { EventAnnouncementsDTO } from "@/lib/music/announcements/schema";
import type { EventImageSetsDTO } from "@/lib/music/projection/images";
import type { ProjectionLook, ProjectionThemeDTO } from "@/lib/music/projection/themes";
import { SafeError } from "@/server/music/errors";
import {
  cacheVerses,
  getCachedVerses,
  type CachedVerseDTO,
} from "@/server/music/models/scripture-cache";
import { listEventAnnouncements } from "@/server/music/models/announcements";
import { requireEventAdminOf } from "@/server/music/models/event-access";
import { listEventImageSets } from "@/server/music/models/event-images";
import {
  getEventDetail,
  listEventVolunteers,
  type VolunteerDTO,
} from "@/server/music/models/events";
import {
  getDefaultProjectionLook,
  readProjectionThemes,
} from "@/server/music/models/projection-themes";
import { SETLIST_MAX_ITEMS, type SetlistItemDTO } from "@/server/music/models/setlists";
import { isWorkspaceModuleOn } from "@/server/workspace-nav";
import { getCurrentUser } from "@/server/music/auth";
import {
  listSongTags,
  listSongsWithArrangements,
  type SongWithArrangementsDTO,
} from "@/server/music/models/songs";
import { runSave, type SaveResult } from "@/server/music/form-state";
import type { EventBlockDTO } from "@/server/music/models/event-blocks";
import {
  closeProjectionController,
  touchProjectionController,
} from "@/server/music/models/event-sync";
import {
  getEventProjection,
  getEventProjectionBlocks,
  getEventProjectionConnection,
  listRehearsalProjectionSongs,
  reorderEventProjection,
  setEventItemProjectionTheme,
  setEventProjectionTheme,
  startEventBlock,
  type EventProjectionDTO,
  type ProjectionConnectionDTO,
  type RehearsalProjectionSongDTO,
  type ReorderedEventProjectionDTO,
} from "@/server/music/models/projections";
import {
  musicEventIn,
  musicProjection,
  musicRehearsal,
  musicProjectionChild,
  musicScripture,
} from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

// The model checks the session and the input. These actions only turn its results and errors into
// values for the controller, behind `withPolicy` (the controller unwraps them: `actions-client.ts`).

export type StartBlockResult =
  { status: "success"; startedAt: string | null } | { status: "error"; message: string };

export type ReorderResult =
  | ({ status: "success" } & ReorderedEventProjectionDTO)
  | { status: "changed" }
  | { status: "error"; message: string };

const THEME_MESSAGES = {
  failure: ({ m }: I18n) => m.project.themes.saveFailed,
  notFound: ({ m }: I18n) => m.project.gate.notFoundDescription,
};

/**
 * The items of the event now (see `getEventProjection`), after a change on another device. Null when
 * the user has no access anymore, or there is no such event. Undefined when the load fails, e.g.
 * without a network: then nothing changes.
 */
export const eventProjectionAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (_scope: PolicyScope, eventId: string): Promise<EventProjectionDTO | null | undefined> => {
    try {
      return await getEventProjection(eventId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to load the items:", cause);
      return undefined;
    }
  },
);

/**
 * The blocks of the event now (see `getEventProjectionBlocks`), after a change of a block on another
 * device. Null when the user has no access anymore, or there is no such event. Undefined when the
 * load fails.
 */
export const eventProjectionBlocksAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (_scope: PolicyScope, eventId: string): Promise<EventBlockDTO[] | null | undefined> => {
    try {
      return await getEventProjectionBlocks(eventId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to load the blocks:", cause);
      return undefined;
    }
  },
);

/** The controller `controllerId` is open (see `touchProjectionController`). False when it fails. */
export const projectionControllerOpenAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (_scope: PolicyScope, eventId: string, controllerId: string): Promise<boolean> => {
    try {
      return await touchProjectionController(eventId, controllerId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to tell that the controller is open:", cause);
      return false;
    }
  },
);

/** The controller `controllerId` closed. Without a network, its row expires. */
export const projectionControllerClosedAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (_scope: PolicyScope, eventId: string, controllerId: string): Promise<void> => {
    try {
      await closeProjectionController(eventId, controllerId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to tell that the controller closed:", cause);
    }
  },
);

/**
 * The Realtime channel of the event's projection, for the main menu: it shows a link back to the
 * controller while a screen of the event is open (see `RunningProjectionsProvider`). Null when the
 * user has no access. Undefined when the check fails, e.g. without a network.
 */
export const eventProjectionConnectionAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (
    _scope: PolicyScope,
    eventId: string,
  ): Promise<ProjectionConnectionDTO | null | undefined> => {
    try {
      return await getEventProjectionConnection(eventId);
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to get the channel for the menu:", cause);
      return undefined;
    }
  },
);

/** Sets the projection theme of the event: null for the default theme. */
export const setEventThemeAction = withPolicy(
  "music.projection.use",
  musicProjectionChild("themes"),
  async (_scope: PolicyScope, eventId: string, themeId: string | null): Promise<SaveResult> =>
    runSave(THEME_MESSAGES, () => setEventProjectionTheme(eventId, themeId)),
);

/** Sets the projection theme of an item of the event (by its key): null for the theme of the event. */
export const setItemThemeAction = withPolicy(
  "music.projection.use",
  musicProjectionChild("themes"),
  async (
    _scope: PolicyScope,
    eventId: string,
    itemKey: string,
    themeId: string | null,
  ): Promise<SaveResult> =>
    runSave(THEME_MESSAGES, () => setEventItemProjectionTheme(eventId, itemKey, themeId)),
);

/**
 * Starts the countdown "remaining" of the block of the event (see `startEventBlock`): when an item
 * of it goes live, or with `restart` by "Restart countdown". `startedAt`: the start that all
 * devices show.
 */
export const startEventBlockAction = withPolicy(
  "music.projection.use",
  musicProjectionChild("countdown"),
  async (
    _scope: PolicyScope,
    eventId: string,
    key: string,
    restart: boolean,
  ): Promise<StartBlockResult> => {
    const i18n = await getRequestI18n();
    try {
      const startedAt = await startEventBlock(eventId, key, restart === true);
      if (startedAt !== undefined) return { status: "success", startedAt };
      return { status: "error", message: i18n.m.server.eventBlocks.blockMissing };
    } catch (cause) {
      if (cause instanceof SafeError) return { status: "error", message: cause.text(i18n) };
      console.error("[projection] Failed to start the block:", cause);
      return { status: "error", message: i18n.m.components.eventBlocks.restartFailed };
    }
  },
);

/** Moves the items of the event to the order of `keys` (see `reorderEventProjection`). "changed": the items changed on another device. */
export const reorderEventItemsAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    setlistId: string,
    keys: string[],
  ): Promise<ReorderResult> => {
    const i18n = await getRequestI18n();
    try {
      const result = await reorderEventProjection(eventId, { setlistId, keys });
      if (result === "changed") return { status: "changed" };
      if (result) return { status: "success", ...result };
      return { status: "error", message: i18n.m.project.controller.reorderFailed };
    } catch (cause) {
      if (cause instanceof SafeError) return { status: "error", message: cause.text(i18n) };
      console.error("[projection] Failed to reorder the items:", cause);
      return { status: "error", message: i18n.m.project.controller.reorderFailed };
    }
  },
);

export type RehearsalSongsResult =
  { status: "success"; songs: RehearsalProjectionSongDTO[] } | { status: "error"; message: string };

/** The songs by arrangement (a song that the quick add chose). */
export const listRehearsalSongsAction = withPolicy(
  "music.projection.use",
  musicProjectionChild("quick-add"),
  async (_scope: PolicyScope, arrangementIds: string[]): Promise<RehearsalSongsResult> => {
    try {
      return { status: "success", songs: await listRehearsalProjectionSongs(arrangementIds) };
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to list the songs:", cause);
      return { status: "error", message: (await getRequestI18n()).m.project.gate.loadFailed };
    }
  },
);

export type QuickAddCatalogResult =
  | {
      status: "success";
      catalog: SongWithArrangementsDTO[];
      /** Only song admins can add a song here (the button only; the save checks again). */
      newSong: { tagOptions: string[] } | null;
    }
  | { status: "error"; message: string };

/** Every song with its arrangements, for the quick add of the controller. */
export const listQuickAddCatalogAction = withPolicy(
  "music.projection.use",
  musicProjectionChild("quick-add"),
  async (_scope: PolicyScope): Promise<QuickAddCatalogResult> => {
    try {
      const [catalog, user] = await Promise.all([listSongsWithArrangements(), getCurrentUser()]);
      const newSong = user?.canEditSongs ? { tagOptions: await listSongTags() } : null;
      return { status: "success", catalog, newSong };
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to list the songs for the quick add:", cause);
      return { status: "error", message: (await getRequestI18n()).m.project.quickAdd.loadFailed };
    }
  },
);

/** A part of the data of the items editor of the controller, which a change of the event can make old. */
export type ItemsEditorPart =
  "event" | "volunteers" | "catalog" | "themes" | "images" | "announcements";

/** The items of the event and its times: the `event` part. */
export type ItemsEditorEventDTO = {
  /** The setlist of the saved items: the base of the next save of the editor. */
  setlistId: string | null;
  items: SetlistItemDTO[];
  blocks: EventBlockDTO[];
  projectionThemeId: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

/** The parts that the editor asked for; the other parts are not in it. */
export type ItemsEditorPartsDTO = {
  event?: ItemsEditorEventDTO;
  /** Without emails. */
  volunteers?: VolunteerDTO[];
  catalog?: SongWithArrangementsDTO[];
  /** The projection themes, the default first, with their look. */
  themes?: ProjectionThemeDTO[];
  imageSets?: EventImageSetsDTO;
  announcements?: EventAnnouncementsDTO;
  canEditSongs: boolean;
  maxItems: number;
};

/**
 * The parts of the data of the items editor of the controller, as on the page of the event. For the
 * event admins. After a change of the event, the editor loads only the parts that the change can
 * make old. Null when the user has no access, or there is no such event. Undefined when the load fails.
 */
export const eventItemsEditorAction = withPolicy(
  "music.event.manage",
  musicEventIn,
  async (
    _scope: PolicyScope,
    eventId: string,
    parts: unknown,
  ): Promise<ItemsEditorPartsDTO | null | undefined> => {
    try {
      const user = await requireEventAdminOf(eventId);
      if (!user) return null;
      const wanted = new Set(Array.isArray(parts) ? parts : []);
      // Not the parts of a module that is off: the editor hides them.
      const [themesOn, imagesOn, announcementsOn] = await Promise.all([
        isWorkspaceModuleOn("ws.music.projection.themes"),
        isWorkspaceModuleOn("ws.music.events.images"),
        isWorkspaceModuleOn("ws.music.events.announcements"),
      ]);
      const [event, volunteers, catalog, themes, imageSets, announcements] = await Promise.all([
        wanted.has("event") ? getEventDetail(eventId) : undefined,
        wanted.has("volunteers") ? listEventVolunteers(eventId) : undefined,
        wanted.has("catalog") ? listSongsWithArrangements() : undefined,
        wanted.has("themes") && themesOn ? readProjectionThemes() : undefined,
        wanted.has("images") && imagesOn ? listEventImageSets(eventId) : undefined,
        wanted.has("announcements") && announcementsOn
          ? listEventAnnouncements(eventId)
          : undefined,
      ]);
      if (event === null) return null;
      return {
        event: event && {
          setlistId: event.setlistId ?? null,
          items: event.items,
          blocks: event.blocks,
          projectionThemeId: event.projectionThemeId ?? null,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          durationMinutes: event.durationMinutes,
        },
        volunteers: volunteers?.map((person) => ({ ...person, email: null })),
        catalog,
        themes,
        imageSets,
        announcements,
        canEditSongs: user.canEditSongs,
        maxItems: SETLIST_MAX_ITEMS,
      };
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to load the items editor:", cause);
      return cause instanceof SafeError ? null : undefined;
    }
  },
);

/**
 * The verses of the chapters of the book in the church's cache of a pasted translation (see
 * `getCachedVerses`). Undefined when the load fails, e.g. without a network.
 */
export const cachedVersesAction = withPolicy(
  "music.scripture.use",
  musicScripture,
  async (
    _scope: PolicyScope,
    translation: string,
    book: string,
    chapters: number[],
  ): Promise<CachedVerseDTO[] | undefined> => {
    try {
      return await getCachedVerses({ translation, book, chapters });
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to load the cached verses:", cause);
      return undefined;
    }
  },
);

/** Puts the pasted verses of a scripture reading in the church's cache (see `cacheVerses`). `eventId`: of the projection, else null. */
export const cacheVersesAction = withPolicy(
  "music.scripture.use",
  musicScripture,
  (
    _scope: PolicyScope,
    translation: string,
    book: string,
    verses: CachedVerseDTO[],
    eventId: string | null = null,
  ): Promise<SaveResult> =>
    runSave(
      {
        failure: ({ m }) => m.project.paste.saveFailed,
        notFound: ({ m }) => m.project.paste.saveFailed,
      },
      () => cacheVerses({ translation, book, verses }, eventId),
    ),
);

/** The songs of the rehearsal list of this browser, by arrangement (the rehearsal projection; module `rehearsal`). */
export const rehearsalSongsAction = withPolicy(
  "music.projection.use",
  musicRehearsal,
  async (_scope: PolicyScope, arrangementIds: string[]): Promise<RehearsalSongsResult> => {
    try {
      return { status: "success", songs: await listRehearsalProjectionSongs(arrangementIds) };
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to list the rehearsal songs:", cause);
      return { status: "error", message: (await getRequestI18n()).m.project.gate.loadFailed };
    }
  },
);

/** The look of the default projection theme, for a rehearsal. Null when it fails: then the look from before. */
export const defaultProjectionLookAction = withPolicy(
  "music.projection.use",
  musicRehearsal,
  async (_scope: PolicyScope): Promise<ProjectionLook | null> => {
    try {
      return await getDefaultProjectionLook();
    } catch (cause) {
      if (!(cause instanceof SafeError))
        console.error("[projection] Failed to get the default theme:", cause);
      return null;
    }
  },
);

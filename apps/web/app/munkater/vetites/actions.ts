"use server";

import type { I18n } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import { SafeError } from "@/server/music/errors";
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
  reorderEventProjection,
  setEventItemProjectionTheme,
  setEventProjectionTheme,
  startEventBlock,
  type EventProjectionDTO,
  type ProjectionConnectionDTO,
  type ReorderedEventProjectionDTO,
} from "@/server/music/models/projections";
import { musicEventIn, musicProjection, musicProjectionChild } from "@/server/music/policy";
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

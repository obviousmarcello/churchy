"use server";

import { musicEventModule } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

import { refresh } from "next/cache";

import type { Text } from "@/i18n/music/i18n";
import { getRequestI18n } from "@/i18n/music/server";
import type { EventImageDTO } from "@/lib/music/projection/images";
import { errorState, file, runSave, text, type SaveResult } from "@/server/music/form-state";
import {
  addEventImage,
  createEventImageSet,
  moveEventImages,
  removeEventImage,
  updateEventImage,
} from "@/server/music/models/event-images";

// The images of the image items of an event (see `event-images.ts`). The model checks the role
// and the input. These actions only turn its results and errors into values
// for the gallery of the event page and for the controller of the projection.

const NOT_FOUND: Text = ({ m }) => m.events.images.notFound;

export type AddEventImageResult =
  { status: "success"; image: EventImageDTO } | { status: "error"; message: string };

export type CreateImageSetResult =
  { status: "success"; setId: string } | { status: "error"; message: string };

/** A new set of images of the event, for a new image item. No refresh: no item uses it yet. */
export const createImageSetAction = withPolicy(
  "music.event.manage",
  musicEventModule("images"),
  async (_scope: PolicyScope, eventId: string): Promise<CreateImageSetResult> => {
    try {
      const setId = await createEventImageSet(eventId);
      if (setId) return { status: "success", setId };
      return { status: "error", message: NOT_FOUND(await getRequestI18n()) };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.events.images.uploadFailed);
      return { status: "error", message: state.message ?? "" };
    }
  },
);

/** Adds the file `image` with the name `name` as the last image of the set `id`. */
export const addEventImageAction = withPolicy(
  "music.event.manage",
  musicEventModule("images"),
  async (_scope: PolicyScope, formData: FormData): Promise<AddEventImageResult> => {
    try {
      const image = await addEventImage(
        text(formData, "id"),
        file(formData, "image"),
        text(formData, "name"),
      );
      if (!image) return { status: "error", message: NOT_FOUND(await getRequestI18n()) };
      refresh();
      return { status: "success", image };
    } catch (error) {
      const state = await errorState(error, ({ m }) => m.events.images.uploadFailed);
      return {
        status: "error",
        message: Object.values(state.fieldErrors).flat()[0] ?? state.message ?? "",
      };
    }
  },
);

/** Saves the name and the adjustments of an image (see `EventImageInput`). */
export const updateEventImageAction = withPolicy(
  "music.event.manage",
  musicEventModule("images"),
  async (_scope: PolicyScope, imageId: string, input: unknown): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.events.images.saveFailed, notFound: NOT_FOUND },
      () => updateEventImage(imageId, input),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

/** Puts the images of the set in the order of `imageIds`. */
export const moveEventImagesAction = withPolicy(
  "music.event.manage",
  musicEventModule("images"),
  async (_scope: PolicyScope, setId: string, imageIds: string[]): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.events.images.moveFailed, notFound: NOT_FOUND },
      () => moveEventImages(setId, imageIds),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

export const removeEventImageAction = withPolicy(
  "music.event.manage",
  musicEventModule("images"),
  async (_scope: PolicyScope, imageId: string): Promise<SaveResult> => {
    const result = await runSave(
      { failure: ({ m }) => m.events.images.removeFailed, notFound: NOT_FOUND },
      () => removeEventImage(imageId),
    );
    if (result.status === "success") refresh();
    return result;
  },
);

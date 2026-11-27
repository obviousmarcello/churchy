"use server";

import { updateEventImage } from "@/server/music/models/event-images";
import { runSave, type SaveResult } from "@/server/music/form-state";
import { musicProjection } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

/**
 * Saves the name and the adjustments of an image (see `EventImageInput`). The users who can project
 * the event change them during the event (the model checks the access to the image's event).
 */
export const updateEventImageAction = withPolicy(
  "music.projection.use",
  musicProjection,
  async (_scope: PolicyScope, imageId: string, input: unknown): Promise<SaveResult> =>
    runSave(
      {
        failure: ({ m }) => m.events.images.saveFailed,
        notFound: ({ m }) => m.events.images.notFound,
      },
      () => updateEventImage(imageId, input),
    ),
);

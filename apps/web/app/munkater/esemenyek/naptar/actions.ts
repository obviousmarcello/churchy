"use server";

import { headers } from "next/headers";

import {
  deleteMyCalendarFeed,
  enableMyCalendarFeed,
  renewMyCalendarFeed,
} from "@/server/music/models/calendar-feeds";
import { musicEvents } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

// Everyone who sees events has their own feed (`music.event.view`); the models only touch the
// signed-in user's row. The link is returned once: the table keeps only its hash.

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
}

export const enableCalendarFeedAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (_scope, formData: FormData): Promise<{ link: string | null; on: boolean }> => {
    // The consent comes with the tap: without it nothing is made.
    if (formData.get("consent") !== "on") return { link: null, on: false };
    return { link: await enableMyCalendarFeed(await origin()), on: true };
  },
);

export const renewCalendarFeedAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (): Promise<{ link: string | null; on: boolean }> => {
    const link = await renewMyCalendarFeed(await origin());
    return { link, on: link !== null };
  },
);

export const disableCalendarFeedAction = withPolicy(
  "music.event.view",
  musicEvents,
  async (): Promise<{ link: string | null; on: boolean }> => {
    await deleteMyCalendarFeed();
    return { link: null, on: false };
  },
);

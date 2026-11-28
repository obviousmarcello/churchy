import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendDueNotifications } from "@/server/music/notifications";
import { removeUnusedAnnouncements } from "@/server/music/models/announcements";
import { removeUnusedEventImageSets } from "@/server/music/models/event-images";
import { removeStrayImageFiles } from "@/server/music/models/images";
import { runScheduledResearch } from "@/server/music/models/song-rights-research";
import { removeStrayFiles } from "@/server/music/models/stray-files";
import type { CleanupSteps } from "./handlers";

// The work of the jobs, in the scope of one church (`runWithMusicClient`: the models read the
// client of the church). Each step logs its own failure and the others still run.

export const sendDue = (db: SupabaseClient, tenantId: string) => sendDueNotifications(db, tenantId);

export const research = runScheduledResearch;

async function attempt(name: string, step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch (error) {
    console.error(`[jobs] ${name} failed:`, error instanceof Error ? error.message : "error");
  }
}

async function rpcCount(db: SupabaseClient, fn: string): Promise<void> {
  const { error } = await db.rpc(fn);
  if (error) throw new Error(`${fn}: ${error.message}`);
}

export const cleanupSteps: CleanupSteps = {
  nightly: async (db) => {
    await attempt("purge removed courses", () => rpcCount(db, "purge_removed_courses"));
    await attempt("remove unused course images", () => rpcCount(db, "remove_unused_course_images"));
  },
  hourly: async (db) => {
    await attempt("stray image files", removeStrayImageFiles);
    await attempt("stray files", removeStrayFiles);
    await attempt("unused event image sets", removeUnusedEventImageSets);
    await attempt("unused announcements", removeUnusedAnnouncements);
    // Open projections that nobody has seen for 23 hours, and scripture verses older than a day.
    await attempt("closed projection controllers", async () => {
      const { error } = await db
        .from("event_projection_controllers")
        .delete()
        .lt("seen_at", new Date(Date.now() - 23 * 3_600_000).toISOString());
      if (error) throw new Error(error.message);
    });
    await attempt("expired scripture verses", async () => {
      const { error } = await db
        .from("scripture_verse_cache")
        .delete()
        .lte("cached_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
      if (error) throw new Error(error.message);
    });
  },
};

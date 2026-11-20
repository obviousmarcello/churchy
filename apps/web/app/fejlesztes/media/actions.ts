"use server";

import type { Ctx } from "@churchy/contracts";
import type { MediaItem, MediaUploadInput } from "@churchy/ui";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import { DEMO_MEDIA_QUOTA_BYTES, toCreateInput, toMediaItem } from "@/lib/media/view";
import { demoDirectory } from "@/server/data-adapters";
import { demoAction } from "@/server/policy";
import { getRequestRepositories } from "@/server/repositories";
import { getRequestContext } from "@/server/session";

/**
 * Dev tools for the media library UI (D-19 [UI]). They act on the visitor's own in-memory demo
 * store through `MediaRepo` (`demoAction()` exemption of the policy wrapper, D-05); the real
 * admin will use `withPolicy` with a media permission once D-19 [BE] adds one.
 */

export interface MediaLibraryState {
  items: MediaItem[];
  usage: { bytes: number; quotaBytes: number };
}

export type MediaActionResult = { ok: true; state: MediaLibraryState } | { ok: false };

async function staffCtx(): Promise<Ctx> {
  const tenantId = (await getRequestContext()).tenantId ?? demoDirectory().defaultTenantId;
  return { tenantId, actor: { userId: "dev-user", personId: null } };
}

async function stateOf(): Promise<MediaLibraryState> {
  const { media } = await getRequestRepositories();
  const ctx = await staffCtx();
  const [page, usage] = await Promise.all([media.list(ctx, { pageSize: 100 }), media.usage(ctx)]);
  return {
    items: page.items.map(toMediaItem),
    usage: { bytes: usage.bytes, quotaBytes: DEMO_MEDIA_QUOTA_BYTES },
  };
}

async function guarded(run: () => Promise<void>): Promise<MediaActionResult> {
  assertDevRoutesVisible();
  try {
    await run();
  } catch {
    return { ok: false };
  }
  return { ok: true, state: await stateOf() };
}

export const loadMediaLibrary = demoAction(async (): Promise<MediaLibraryState> => {
  assertDevRoutesVisible();
  return stateOf();
});

export const uploadMedia = demoAction(async (input: MediaUploadInput): Promise<MediaActionResult> =>
  guarded(async () => {
    const { media } = await getRequestRepositories();
    await media.create(await staffCtx(), toCreateInput(input));
  }),
);

export const updateMedia = demoAction(
  async (
    id: string,
    patch: {
      alt: string | null;
      decorative: boolean;
      caption: string | null;
      peopleConsent: boolean;
    },
  ): Promise<MediaActionResult> =>
    guarded(async () => {
      const { media } = await getRequestRepositories();
      await media.update(await staffCtx(), id, patch);
    }),
);

export const deleteMedia = demoAction(async (id: string): Promise<MediaActionResult> =>
  guarded(async () => {
    const { media } = await getRequestRepositories();
    await media.delete(await staffCtx(), id);
  }),
);

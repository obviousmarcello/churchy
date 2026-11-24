import "server-only";

import { z } from "zod";

import { CAPO_MAX } from "@/lib/music/chords/capo";
import {
  DEVICE_TYPES,
  isEmptyView,
  ownValues,
  sheetViewSchema,
  storedSheetViewSchema,
  type SongViews,
} from "@/lib/music/sheet-view";
import { requireUser } from "@/server/music/auth";
import { getMusicSupabase } from "@/server/music/db";
import { playKeySchema } from "./arrangements";
import { databaseError, isId, parseInput } from "./shared";

// The signed-in user's own settings for an arrangement: the capo and the key,
// and the layout of the sheet on each type of device (see `sheet-view.ts`).
// They show in every sheet that plays the arrangement (a song, a rehearsal,
// an event). Every function is scoped to the signed-in user.

/** Null: use the chart's. */
export type ArrangementSettingsDTO = {
  capo: number | null;
  /** In English note names, e.g. "Bb". */
  key: string | null;
  /** By device type. A type without a view uses the device's settings. */
  views: SongViews;
};

const capoSchema = z.number().int().min(0).max(CAPO_MAX).nullable();
const keySchema = playKeySchema.nullable();
const deviceTypeSchema = z.enum(DEVICE_TYPES);

/** The signed-in user's settings for each of these arrangements that has some. */
export async function getMyArrangementSettings(
  arrangementIds: string[],
): Promise<Map<string, ArrangementSettingsDTO>> {
  const user = await requireUser();
  return settingsByArrangement(user.id, arrangementIds);
}

/** For the other models. `userId` must be the signed-in user. */
export async function settingsByArrangement(
  userId: string,
  arrangementIds: string[],
): Promise<Map<string, ArrangementSettingsDTO>> {
  const ids = [...new Set(arrangementIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const admin = await getMusicSupabase();
  const [settings, views] = await Promise.all([
    admin
      .from("user_arrangements")
      .select("arrangement_id, capo, musical_key")
      .eq("user_id", userId)
      .in("arrangement_id", ids),
    admin
      .from("user_arrangement_views")
      .select("arrangement_id, device_type, settings")
      .eq("user_id", userId)
      .in("arrangement_id", ids),
  ]);
  if (settings.error) throw databaseError("load arrangement settings", settings.error);
  if (views.error) throw databaseError("load arrangement views", views.error);

  const result = new Map<string, ArrangementSettingsDTO>();
  const entry = (arrangementId: string) => {
    let current = result.get(arrangementId);
    if (!current) result.set(arrangementId, (current = { capo: null, key: null, views: {} }));
    return current;
  };
  for (const row of z
    .array(
      z.object({
        arrangement_id: z.uuid(),
        capo: z.number().int().nullable(),
        musical_key: z.string().nullable(),
      }),
    )
    .parse(settings.data)) {
    Object.assign(entry(row.arrangement_id), { capo: row.capo, key: row.musical_key });
  }
  for (const row of z
    // A row of a device type that the app does not know anymore drops out.
    .array(
      z.object({
        arrangement_id: z.uuid(),
        device_type: z.string(),
        settings: storedSheetViewSchema,
      }),
    )
    .parse(views.data)) {
    const deviceType = deviceTypeSchema.safeParse(row.device_type);
    if (deviceType.success)
      entry(row.arrangement_id).views[deviceType.data] = ownValues(row.settings);
  }
  return result;
}

/**
 * Sets the signed-in user's own layout of the arrangement on a type of
 * device: only the settings that the song does not take from the device. An
 * empty view or null uses the device's settings again. Returns false if there
 * is no such arrangement.
 */
export async function setMyView(
  arrangementId: string,
  deviceType: unknown,
  view: unknown,
): Promise<boolean> {
  const user = await requireUser();
  if (!isId(arrangementId)) return false;
  const type = parseInput(deviceTypeSchema, deviceType);
  const values = ownValues(parseInput(sheetViewSchema.nullable(), view) ?? {});
  const admin = await getMusicSupabase();

  if (isEmptyView(values)) {
    const { error } = await admin
      .from("user_arrangement_views")
      .delete()
      .eq("user_id", user.id)
      .eq("arrangement_id", arrangementId)
      .eq("device_type", type);
    if (error) throw databaseError("clear arrangement view", error);
    return true;
  }

  const { error } = await admin
    .from("user_arrangement_views")
    .upsert(
      { user_id: user.id, arrangement_id: arrangementId, device_type: type, settings: values },
      { onConflict: "tenant_id,user_id,arrangement_id,device_type" },
    );
  if (error?.code === "23503") return false;
  if (error) throw databaseError("set arrangement view", error);
  return true;
}

/** Sets the signed-in user's capo, or clears it (null) to use the chart's. Returns false if there is no such arrangement. */
export async function setMyCapo(arrangementId: string, capo: unknown): Promise<boolean> {
  const user = await requireUser();
  if (!isId(arrangementId)) return false;
  return setSetting(user.id, arrangementId, "capo", parseInput(capoSchema, capo));
}

/**
 * Sets the signed-in user's key (in English note names), or clears it (null)
 * to use the key of the event or the chart. Returns false if there is no such
 * arrangement.
 */
export async function setMyKey(arrangementId: string, key: unknown): Promise<boolean> {
  const user = await requireUser();
  if (!isId(arrangementId)) return false;
  return setSetting(user.id, arrangementId, "musical_key", parseInput(keySchema, key));
}

const OTHER_SETTING = { capo: "musical_key", musical_key: "capo" } as const;

async function setSetting(
  userId: string,
  arrangementId: string,
  column: "capo" | "musical_key",
  value: number | string | null,
): Promise<boolean> {
  const admin = await getMusicSupabase();

  if (value === null) {
    // A row needs at least one setting: without the other one, the row goes.
    const deleted = await admin
      .from("user_arrangements")
      .delete()
      .eq("user_id", userId)
      .eq("arrangement_id", arrangementId)
      .is(OTHER_SETTING[column], null);
    if (deleted.error) throw databaseError(`clear ${column}`, deleted.error);

    const updated = await admin
      .from("user_arrangements")
      .update({ [column]: null })
      .eq("user_id", userId)
      .eq("arrangement_id", arrangementId);
    if (updated.error) throw databaseError(`clear ${column}`, updated.error);
    return true;
  }

  // Changes only this setting of an existing row.
  const { error } = await admin
    .from("user_arrangements")
    .upsert(
      { user_id: userId, arrangement_id: arrangementId, [column]: value },
      { onConflict: "tenant_id,user_id,arrangement_id" },
    );
  if (error?.code === "23503") return false;
  if (error) throw databaseError(`set ${column}`, error);
  return true;
}

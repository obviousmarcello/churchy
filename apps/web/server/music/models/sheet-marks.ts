import "server-only";

import { z } from "zod";

import {
  MARKS_PER_ARRANGEMENT_MAX,
  sheetMarkSchema,
  type SheetMark,
} from "@/lib/music/sheet-marks";
import { requireUser } from "@/server/music/auth";
import { ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, idSchema, isId, parseInput } from "./shared";

// The signed-in user's own marks on the chord sheet of an arrangement:
// strokes and texts (see `src/lib/sheet-marks.ts`). They show in every sheet
// that plays the arrangement. Every function is scoped to the signed-in user.

/** One change of the marks: one action of the user, or its undo. */
export const sheetMarksChangeSchema = z.strictObject({
  /** New marks, and new versions of marks. */
  upsert: z
    .array(sheetMarkSchema)
    .max(MARKS_PER_ARRANGEMENT_MAX)
    .refine((marks) => new Set(marks.map((mark) => mark.id)).size === marks.length),
  /** The ids of the marks to erase. */
  remove: z.array(idSchema).max(MARKS_PER_ARRANGEMENT_MAX),
});

export type SheetMarksChange = z.input<typeof sheetMarksChangeSchema>;

const rowSchema = z.object({
  id: z.uuid(),
  arrangement_id: z.uuid(),
  mark: z.record(z.string(), z.unknown()),
});

/** The signed-in user's marks on each of these arrangements that has some, oldest first. */
export async function listMySheetMarks(
  arrangementIds: string[],
): Promise<Map<string, SheetMark[]>> {
  const user = await requireUser();
  const ids = [...new Set(arrangementIds.filter(isId))];
  const marks = new Map<string, SheetMark[]>();
  if (ids.length === 0) return marks;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("sheet_marks")
    .select("id, arrangement_id, mark")
    .eq("user_id", user.id)
    .in("arrangement_id", ids)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw databaseError("list sheet marks", error);

  for (const row of z.array(rowSchema).parse(data)) {
    // A mark that does not match the schema anymore stays stored, but does not show.
    const mark = sheetMarkSchema.safeParse({ ...row.mark, id: row.id });
    if (!mark.success) continue;
    const list = marks.get(row.arrangement_id) ?? [];
    list.push(mark.data);
    marks.set(row.arrangement_id, list);
  }
  return marks;
}

/**
 * Erases and saves marks of the signed-in user on an arrangement. Returns
 * false if there is no such arrangement.
 */
export async function changeMySheetMarks(arrangementId: string, change: unknown): Promise<boolean> {
  const user = await requireUser();
  if (!isId(arrangementId)) return false;
  const { upsert, remove } = parseInput(sheetMarksChangeSchema, change);
  const admin = await getMusicSupabase();

  if (remove.length > 0) {
    const { error } = await admin
      .from("sheet_marks")
      .delete()
      .eq("user_id", user.id)
      .eq("arrangement_id", arrangementId)
      .in("id", remove);
    if (error) throw databaseError("erase sheet marks", error);
  }
  if (upsert.length === 0) return true;

  const upsertIds = upsert.map((mark) => mark.id);
  const { count, error: countError } = await admin
    .from("sheet_marks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("arrangement_id", arrangementId)
    .not("id", "in", `(${upsertIds.join(",")})`);
  if (countError) throw databaseError("count sheet marks", countError);
  if ((count ?? 0) + upsert.length > MARKS_PER_ARRANGEMENT_MAX) {
    throw new ValidationError([
      { path: "upsert", message: ({ m }) => m.server.sheetMarks.tooMany },
    ]);
  }

  const { error } = await admin.from("sheet_marks").upsert(
    upsert.map(({ id, ...mark }) => ({
      user_id: user.id,
      id,
      arrangement_id: arrangementId,
      mark,
    })),
    { onConflict: "tenant_id,user_id,id" },
  );
  if (error?.code === "23503") return false;
  if (error) throw databaseError("save sheet marks", error);
  return true;
}

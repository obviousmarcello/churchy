import type { FileView } from "@/lib/music/file-view";
import type { SheetMark } from "@/lib/music/sheet-marks";
import type { DeviceType, SheetView } from "@/lib/music/sheet-view";
import type { FileKind } from "@/server/music/models/my-file-views";
import type { SheetMarksChange } from "@/server/music/models/sheet-marks";
import * as server from "./sheet-actions";

// The chord sheet's actions with their music-app signatures (Music Sheet DB's `capo-actions.ts`,
// `mark-actions.ts`, `tempo-actions.ts`, `zoom-actions.ts`). A policy denial (only possible when
// the page is out of date or tampered with) becomes an error without a message.

export type CapoResult = server.SaveResult;
export type MarksResult = server.SaveResult;
export type TempoResult = server.SaveResult;

const DENIED: CapoResult = { status: "error", message: "" };

async function unwrap<T>(
  result: Promise<{ ok: true; value: T } | { ok: false }>,
  denied: T,
): Promise<T> {
  const r = await result;
  return r.ok ? r.value : denied;
}

export const setCapoAction = (arrangementId: string, capo: number | null) =>
  unwrap(server.setCapo(arrangementId, capo), DENIED);

export const setKeyAction = (arrangementId: string, key: string | null) =>
  unwrap(server.setKey(arrangementId, key), DENIED);

export const setViewAction = (
  arrangementId: string,
  deviceType: DeviceType,
  view: SheetView | null,
) => unwrap(server.setView(arrangementId, deviceType, view), DENIED);

export const setFileViewAction = (kind: FileKind, fileId: string, view: FileView | null) =>
  unwrap(server.setFileView(kind, fileId, view), DENIED);

export const changeMarksAction = (arrangementId: string, change: SheetMarksChange) =>
  unwrap(server.changeMarks(arrangementId, change), DENIED);

export const listMarksAction = (arrangementId: string): Promise<SheetMark[] | null> =>
  unwrap(server.listMarks(arrangementId), null);

export const saveTempoAction = (arrangementId: string, bpm: number) =>
  unwrap(server.saveTempo(arrangementId, bpm), DENIED);

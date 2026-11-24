"use client";

import type { FormState } from "@/server/music/form-state";
import * as server from "./file-actions";

// The file actions with their music-app signatures: a policy denial (only possible when the
// page is out of date or tampered with) becomes an error state without a message.
type Denied = { readonly ok: false; readonly status: 403 | 404 };
type Allowed<T> = { readonly ok: true; readonly value: T };
const DENIED: FormState = { status: "error", message: null, fieldErrors: {} };
async function unwrap<T>(result: Promise<Allowed<T> | Denied>): Promise<T | FormState> {
  const r = await result;
  return r.ok ? r.value : DENIED;
}

export const addScoreAction = (...args: Parameters<typeof server.addScoreAction>) =>
  unwrap(server.addScoreAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addScoreAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const replaceScoreAction = (...args: Parameters<typeof server.replaceScoreAction>) =>
  unwrap(server.replaceScoreAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.replaceScoreAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const updateScoreAction = (...args: Parameters<typeof server.updateScoreAction>) =>
  unwrap(server.updateScoreAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.updateScoreAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const removeScoreAction = (...args: Parameters<typeof server.removeScoreAction>) =>
  unwrap(server.removeScoreAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removeScoreAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const startPdfUploadAction = (...args: Parameters<typeof server.startPdfUploadAction>) =>
  unwrap(server.startPdfUploadAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.startPdfUploadAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const addPdfAction = (...args: Parameters<typeof server.addPdfAction>) =>
  unwrap(server.addPdfAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addPdfAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const updatePdfAction = (...args: Parameters<typeof server.updatePdfAction>) =>
  unwrap(server.updatePdfAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.updatePdfAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const removePdfAction = (...args: Parameters<typeof server.removePdfAction>) =>
  unwrap(server.removePdfAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removePdfAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const addImageAction = (...args: Parameters<typeof server.addImageAction>) =>
  unwrap(server.addImageAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addImageAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const addImagePageAction = (...args: Parameters<typeof server.addImagePageAction>) =>
  unwrap(server.addImagePageAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addImagePageAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const showImagePagesAction = (...args: Parameters<typeof server.showImagePagesAction>) =>
  unwrap(server.showImagePagesAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.showImagePagesAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const updateImageAction = (...args: Parameters<typeof server.updateImageAction>) =>
  unwrap(server.updateImageAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.updateImageAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const moveImagePagesAction = (...args: Parameters<typeof server.moveImagePagesAction>) =>
  unwrap(server.moveImagePagesAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.moveImagePagesAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const removeImageAction = (...args: Parameters<typeof server.removeImageAction>) =>
  unwrap(server.removeImageAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removeImageAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const removeImagePageAction = (...args: Parameters<typeof server.removeImagePageAction>) =>
  unwrap(server.removeImagePageAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removeImagePageAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const startSoundFileUploadAction = (
  ...args: Parameters<typeof server.startSoundFileUploadAction>
) =>
  unwrap(server.startSoundFileUploadAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.startSoundFileUploadAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const addSoundFileAction = (...args: Parameters<typeof server.addSoundFileAction>) =>
  unwrap(server.addSoundFileAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addSoundFileAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const updateSoundFileAction = (...args: Parameters<typeof server.updateSoundFileAction>) =>
  unwrap(server.updateSoundFileAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.updateSoundFileAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const removeSoundFileAction = (...args: Parameters<typeof server.removeSoundFileAction>) =>
  unwrap(server.removeSoundFileAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removeSoundFileAction>>, Denied> extends Allowed<
      infer V
    >
      ? V
      : never
  >;
export const addLinkAction = (...args: Parameters<typeof server.addLinkAction>) =>
  unwrap(server.addLinkAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.addLinkAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const updateLinkAction = (...args: Parameters<typeof server.updateLinkAction>) =>
  unwrap(server.updateLinkAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.updateLinkAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;
export const removeLinkAction = (...args: Parameters<typeof server.removeLinkAction>) =>
  unwrap(server.removeLinkAction(...args)) as Promise<
    Exclude<Awaited<ReturnType<typeof server.removeLinkAction>>, Denied> extends Allowed<infer V>
      ? V
      : never
  >;

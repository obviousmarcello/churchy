import "server-only";

import { z } from "zod";

import { ValidationError } from "@/server/music/errors";
import { issueText } from "@/server/music/zod-i18n";

// Keep the limits in these helpers in sync with the checks in the migrations.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const idSchema = z.uuid();

/** An id in lower case, as the database returns it: for lookups in maps and sets of ids. */
export const lowerIdSchema = idSchema.transform((value) => value.toLowerCase());

export function isId(value: string) {
  return idSchema.safeParse(value).success;
}

export function requiredText(max: number) {
  return z.string().trim().min(1).max(max);
}

/** Blank strings, null and undefined all become null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
}

/**
 * An ordered list of distinct ids in lower case, e.g. the songs of a setlist.
 * `duplicateMessage` is a message id from `zodMessage()`, e.g. for
 * `m.server.setlists.duplicateKey`.
 */
export function idList(max: number, duplicateMessage: string) {
  return z
    .array(lowerIdSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: duplicateMessage });
}

/**
 * The query with the user who makes the change, for the messages of the event
 * (see \`private.notify_event()\` in the \`event_sync\` migration).
 */
export function withAuthor<Query extends { setHeader(name: string, value: string): Query }>(
  query: Query,
  userId: string,
): Query {
  return query.setHeader("x-app-author", userId);
}

/**
 * With `end`, the query ends the open projections of the users who lose them
 * by the change, and does not fail (see \`private.check_projection_users()\`
 * in the \`event_sync_fixes\` migration).
 */
export function endingProjections<Query extends { setHeader(name: string, value: string): Query }>(
  query: Query,
  end: boolean,
): Query {
  return end ? query.setHeader("x-app-end-projections", "true") : query;
}

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issueText(issue),
      })),
    );
  }
  return result.data;
}

/** The longest name of an uploaded file, as the `file_name` checks in the migrations. */
const FILE_NAME_MAX_LENGTH = 200;

/**
 * Control characters and the marks that change the direction of the text. A
 * mark can make "song‮fdp.exe" show as "songexe.pdf".
 */
// eslint-disable-next-line no-control-regex -- control characters are what it removes
const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g;

/**
 * The name of an uploaded file without folders, control characters and
 * direction marks, at most `FILE_NAME_MAX_LENGTH` characters. A blank name
 * becomes `fallback`.
 */
export function cleanFileName(name: string, fallback: string): string {
  const base = name.replace(UNSAFE_NAME_CHARACTERS, "").split(/[/\\]/).at(-1)?.trim() ?? "";
  return firstCharacters(base || fallback, FILE_NAME_MAX_LENGTH);
}

/**
 * The name that a download saves a checked file with. It ends in one of
 * `extensions` (without the dot), so the device opens the file as the type
 * that the app checked, e.g. "x.exe" becomes "x.exe.pdf". The first extension
 * is added when the name has none of them. The rule applies to old names too.
 */
export function downloadFileName(fileName: string, extensions: readonly string[]): string {
  const name = cleanFileName(fileName, "file");
  const lower = name.toLowerCase();
  if (extensions.some((extension) => lower.endsWith(`.${extension.toLowerCase()}`))) return name;
  return `${name}.${extensions[0]}`;
}

/**
 * The name of a file without its extension, at most `max` characters, e.g.
 * "Amazing Grace - Choir" for "Amazing Grace - Choir.pdf". `extension`
 * matches the extension at the end.
 */
export function nameOfFile(fileName: string, extension: RegExp, max: number): string {
  const name = fileName.replace(extension, "").trim();
  return firstCharacters(name || fileName, max).trim();
}

/** At most `max` characters, as Postgres counts them: a pair of UTF-16 surrogates is one. */
function firstCharacters(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

/** Whether a Storage error says that the file does not exist (its forms differ by API and version). */
export function isStorageNotFound(error: {
  message: string;
  statusCode?: string;
  code?: string;
}): boolean {
  return (
    error.statusCode === "404" || error.code === "NoSuchKey" || error.message === "Object not found"
  );
}

type DatabaseErrorLike = { message: string; code?: string; hint?: string | null };

// Database errors can include table names, constraint names and values. Known
// Postgres error codes map to safe errors given by the caller, e.g.
// "23505" (unique violation) or "23503" (foreign key violation). A key such
// as "P0001:not_event_volunteer" maps only the errors with that hint, because
// every `raise exception` without an errcode is "P0001". Anything else is
// logged on the server and becomes a generic error.
export function databaseError(
  operation: string,
  error: DatabaseErrorLike,
  known: Record<string, () => Error> = {},
): Error {
  const mapped = error.code
    ? (known[`${error.code}:${error.hint}`] ?? known[error.code])
    : undefined;
  if (mapped) return mapped();

  console.error(`[db] Failed to ${operation}:`, error.code, error.message);
  return new Error(`Failed to ${operation}`);
}

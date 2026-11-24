import "server-only";

import { z } from "zod";

import { getRequestI18n } from "@/i18n/music/server";
import { sortAttachmentKeys } from "@/lib/music/attachments";
import { defaultLinkName, isYoutubeLink, toLinkUrl } from "@/lib/music/links";
import { requireSongAdmin, requireUser } from "@/server/music/auth";
import { ConflictError, ValidationError } from "@/server/music/errors";
import { getMusicSupabase } from "@/server/music/db";
import { attachmentArrangementIdsSchema, attachmentKeysSchema } from "./pdfs";
import { databaseError, isId, optionalText, parseInput } from "./shared";

// Links: web pages about a song, e.g. a video on YouTube or a recording on a
// streaming site, each with its own name. As a PDF, a link can be for some
// arrangements of the song and for some keys: none means all arrangements or
// any key. Every signed-in user can see them; only song admins and
// superadmins can change them.

/** The most links of one song. */
export const LINKS_PER_SONG_MAX = 20;
export const LINK_NAME_MAX_LENGTH = 100;

export type SongLinkDTO = {
  id: string;
  /** What the link is, e.g. "Original recording". */
  name: string;
  /** An http or https URL. */
  url: string;
  /** The link goes to YouTube. */
  isYoutube: boolean;
  /** The keys of the link, in English note names, in the order of `ATTACHMENT_KEYS`. Empty: any key. */
  keys: string[];
  /** The arrangements of the link. Empty: all arrangements of the song. */
  arrangementIds: string[];
};

export const LINK_COLUMNS = "id, name, url, musical_keys, song_link_arrangements (arrangement_id)";

export const linkRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  url: z.string(),
  musical_keys: z.array(z.string()),
  song_link_arrangements: z.array(z.object({ arrangement_id: z.uuid() })),
});

/** A blank name uses `defaultLinkName()`. The URL can come without `https://`. */
const linkInputSchema = z.strictObject({
  name: optionalText(LINK_NAME_MAX_LENGTH),
  url: z.string().max(10_000),
  keys: attachmentKeysSchema,
  arrangementIds: attachmentArrangementIdsSchema,
});

export function toSongLink(row: z.infer<typeof linkRowSchema>): SongLinkDTO {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    isYoutube: isYoutubeLink(row.url),
    keys: sortAttachmentKeys(row.musical_keys),
    arrangementIds: row.song_link_arrangements.map((link) => link.arrangement_id),
  };
}

/** By name. `compare` is `i18n.compare` of the request. */
export function sortLinks(
  links: SongLinkDTO[],
  compare: (a: string, b: string) => number,
): SongLinkDTO[] {
  return links.toSorted((a, b) => compare(a.name, b.name));
}

/** The links of these songs, by song. Songs without links are not in the map. */
export async function listLinksOfSongs(songIds: string[]): Promise<Map<string, SongLinkDTO[]>> {
  await requireUser();
  const ids = [...new Set(songIds.filter(isId))];
  if (ids.length === 0) return new Map();

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_links")
    .select(`song_id, ${LINK_COLUMNS}`)
    .in("song_id", ids);
  if (error) throw databaseError("list links", error);

  const { compare } = await getRequestI18n();
  const rows = z.array(linkRowSchema.extend({ song_id: z.uuid() })).parse(data);
  const links = Map.groupBy(rows, (row) => row.song_id);
  return new Map(
    [...links].map(([songId, list]) => [songId, sortLinks(list.map(toSongLink), compare)]),
  );
}

/** Adds a link to the song. Returns false if there is no such song. */
export async function addSongLink(songId: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(songId)) return false;
  const { name, url, keys, arrangementIds } = parseLinkInput(input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("add_song_link", {
    p_song_id: songId,
    p_name: name,
    p_url: url,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
    p_max: LINKS_PER_SONG_MAX,
  });
  if (error) {
    throw databaseError("add link", error, {
      "P0001:too_many_links": () => tooManyError(),
      "P0001:link_arrangement": () => arrangementError(),
    });
  }
  return data !== null;
}

/** Changes the name, the URL, the keys and the arrangements of a link. Returns false if there is no such link. */
export async function updateSongLink(id: string, input: unknown): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;
  const { name, url, keys, arrangementIds } = parseLinkInput(input);

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("update_song_link", {
    p_id: id,
    p_name: name,
    p_url: url,
    p_keys: keys,
    p_arrangement_ids: arrangementIds,
  });
  if (error)
    throw databaseError("update link", error, {
      "P0001:link_arrangement": () => arrangementError(),
    });
  return data === true;
}

/** Removes a link. Returns false if there is no such link. */
export async function removeSongLink(id: string): Promise<boolean> {
  await requireSongAdmin();
  if (!isId(id)) return false;

  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_links")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw databaseError("remove link", error);
  return data.length > 0;
}

/** The input with a checked URL, and a name for a link without one. */
function parseLinkInput(input: unknown) {
  const { name, url: value, ...rest } = parseInput(linkInputSchema, input);
  const url = value.trim() === "" ? null : toLinkUrl(value);
  if (!url) {
    throw new ValidationError([
      {
        path: "url",
        message: ({ m }) =>
          value.trim() === "" ? m.server.links.urlRequired : m.server.links.urlInvalid,
      },
    ]);
  }
  // A host name can be longer than a name.
  return { ...rest, url, name: name ?? defaultLinkName(url).slice(0, LINK_NAME_MAX_LENGTH) };
}

function tooManyError(): ConflictError {
  return new ConflictError(({ m, format }) =>
    format(m.server.links.tooMany, { max: LINKS_PER_SONG_MAX }),
  );
}

function arrangementError(): ValidationError {
  return new ValidationError([
    { path: "arrangementIds", message: ({ m }) => m.server.links.unknownArrangement },
  ]);
}

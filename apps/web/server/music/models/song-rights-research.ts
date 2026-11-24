import "server-only";

import { z } from "zod";

import {
  SONG_AUTHORS_MAX_LENGTH,
  SONG_ORIGINAL_TITLE_MAX_LENGTH,
  SONG_RIGHTS_STATUSES,
  SONG_TRANSLATOR_MAX_LENGTH,
  type SongRightsStatus,
} from "@/lib/music/song-rights";
import { SONG_COPYRIGHT_MAX_LENGTH } from "@/lib/music/song-copyright";
import {
  DEFAULT_LOCAL_RESEARCH_MODEL,
  PROPOSAL_PROVIDERS,
  PROPOSAL_TEXT_FIELDS,
  RESEARCH_PROVIDERS,
  RESEARCH_FINDINGS_MAX_BYTES,
  DEFAULT_RESEARCH_NIGHTLY_LIMIT,
  DEFAULT_RESEARCH_MODELS,
  RESEARCH_RUN_NOW_MAX,
  RESEARCH_RUN_NOW_MIN,
  type ProposalProvider,
  type ResearchProvider,
  type ResearchResult,
} from "@/lib/music/song-rights-research";
import { SONG_SONGBOOK_MAX_LENGTH } from "@/lib/music/song-songbook";
import { requireSongAdmin, requireSuperadmin } from "@/server/music/auth";
import { SafeError } from "@/server/music/errors";
import {
  localResearchSongsFile,
  type LocalResearchSongsFile,
} from "@/server/music/rights-research/local-files";
import { researchUserPrompt, songLyrics } from "@/server/music/rights-research/prompt";
import {
  ResearchError,
  runResearch,
  type ResearchErrorKind,
} from "@/server/music/rights-research/providers";
import { demoModeEnabled } from "@/lib/demo/flag";
import { entitlementsFor } from "@/server/plans";
import { getRequestContext } from "@/server/session";
import { getWorkspaceEnv } from "@/server/workspace";
import {
  researchFindingsSchema,
  researchResultSchema,
} from "@/server/music/rights-research/result";
import { getMusicSupabase } from "@/server/music/db";
import { databaseError, idSchema, optionalText, parseInput } from "./shared";

// The research of the song rights (see the migration `song_rights_research`). Churchy (music
// phase 2): the proposals, their review and the local research (songs file → findings upload) are
// here; the AI research (platform key, per-plan cap, nightly job) is not wired yet, so its settings,
// API key, provider test and "research now" are left out (docs/music-merge/PLAN.md §14).

/** The rejected and failed researches that the settings page shows. */
const RECENT_CLOSED = 10;
/** The proposals that the review page shows at one time, each with its lyrics. */
const PROPOSALS_PAGE_SIZE = 50;

export type ResearchSettingsDTO = {
  enabled: boolean;
  provider: ResearchProvider | null;
  model: string | null;
  nightlyLimit: number;
  /** The last 4 characters of the saved API key, or null. */
  apiKeyHint: string | null;
  /** The songs that the research would take now. */
  openSongs: number;
  counts: { pending: number; accepted: number; rejected: number; failed: number };
  /**
   * The songs whose last research is rejected or failed, and that the nightly
   * research does not take again: a superadmin can start each one by hand.
   */
  recentClosed: {
    songId: string;
    title: string;
    status: "rejected" | "failed";
    error: string | null;
    createdAt: string;
  }[];
};

export type RightsProposalDTO = {
  id: string;
  createdAt: string;
  provider: ProposalProvider;
  model: string;
  result: ResearchResult;
  song: {
    id: string;
    title: string;
    artist: string | null;
    authors: string | null;
    originalTitle: string | null;
    translator: string | null;
    songbook: string | null;
    copyright: string | null;
    rightsStatus: SongRightsStatus;
    lyrics: string;
  };
};

const reviewInputSchema = z.strictObject({
  id: idSchema,
  accept: z.boolean(),
  // Only the fields that the song admin kept. Blank: clears the field of the song.
  changes: z
    .strictObject({
      authors: optionalText(SONG_AUTHORS_MAX_LENGTH).optional(),
      originalTitle: optionalText(SONG_ORIGINAL_TITLE_MAX_LENGTH).optional(),
      translator: optionalText(SONG_TRANSLATOR_MAX_LENGTH).optional(),
      songbook: optionalText(SONG_SONGBOOK_MAX_LENGTH).optional(),
      copyright: optionalText(SONG_COPYRIGHT_MAX_LENGTH).optional(),
      rightsStatus: z.enum(SONG_RIGHTS_STATUSES).optional(),
    })
    .default({}),
});

const settingsRowSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(RESEARCH_PROVIDERS).nullable(),
  model: z.string().nullable(),
  nightly_limit: z.number(),
  api_key_hint: z.string().nullable(),
});

type SettingsRow = z.infer<typeof settingsRowSchema>;

const songRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  authors: z.string().nullable(),
  original_title: z.string().nullable(),
  translator: z.string().nullable(),
  songbook: z.string().nullable(),
  copyright: z.string().nullable(),
  rights_status: z.enum(SONG_RIGHTS_STATUSES),
  arrangements: z.array(z.object({ chordpro: z.string(), is_default: z.boolean() })),
});

const proposalRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  provider: z.enum(PROPOSAL_PROVIDERS),
  model: z.string(),
  result: z.unknown(),
  songs: songRowSchema,
});

// --- Settings --------------------------------------------------------------

export async function getResearchSettings(): Promise<ResearchSettingsDTO> {
  await requireSuperadmin();
  const db = await getMusicSupabase();
  const [settings, counts, closed, open] = await Promise.all([
    readSettings(),
    db.rpc("count_song_rights_proposals"),
    db.rpc("recent_closed_song_rights_proposals", { p_limit: RECENT_CLOSED }),
    db.rpc("count_songs_for_rights_research"),
  ]);
  if (counts.error) throw databaseError("count song rights proposals", counts.error);
  if (closed.error) throw databaseError("list closed song rights proposals", closed.error);
  if (open.error) throw databaseError("count songs for rights research", open.error);

  const closedRows = z
    .array(
      z.object({
        song_id: z.string(),
        title: z.string(),
        status: z.enum(["rejected", "failed"]),
        error: z.string().nullable(),
        created_at: z.string(),
      }),
    )
    .parse(closed.data);

  const countsByStatus = Object.fromEntries(
    z
      .array(z.object({ status: z.string(), count: z.number() }))
      .parse(counts.data)
      .filter((row) => row.status !== "running")
      .map((row) => [row.status, row.count]),
  );

  return {
    enabled: settings.enabled,
    provider: settings.provider,
    model: settings.model,
    nightlyLimit: settings.nightly_limit,
    apiKeyHint: settings.api_key_hint,
    openSongs: z.number().parse(open.data),
    counts: { pending: 0, accepted: 0, rejected: 0, failed: 0, ...countsByStatus },
    recentClosed: closedRows.map((row) => ({
      songId: row.song_id,
      title: row.title,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
    })),
  };
}

// --- Proposals -------------------------------------------------------------

/** The number of proposals that wait for a review, for the link on the songs page. */
export async function countRightsProposals(): Promise<number> {
  await requireSongAdmin();
  const { count, error } = await (
    await getMusicSupabase()
  )
    .from("song_rights_proposals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw databaseError("count song rights proposals", error);
  return count ?? 0;
}

/**
 * The first `PROPOSALS_PAGE_SIZE` proposals that wait for a review, the
 * oldest first, and the number of all of them. The song admins review them. A
 * proposal whose result does not fit the schema (any more) becomes `failed`:
 * a superadmin can research its song again.
 */
export async function listRightsProposals(): Promise<{
  proposals: RightsProposalDTO[];
  total: number;
}> {
  await requireSongAdmin();
  const db = await getMusicSupabase();
  const { data, count, error } = await db
    .from("song_rights_proposals")
    .select(
      "id, created_at, provider, model, result, songs (id, title, artist, authors, original_title, translator, songbook, copyright, rights_status, arrangements (chordpro, is_default))",
      { count: "exact" },
    )
    .eq("status", "pending")
    // Only the chart of the default arrangement.
    .eq("songs.arrangements.is_default", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PROPOSALS_PAGE_SIZE);
  if (error) throw databaseError("list song rights proposals", error);

  const invalid: string[] = [];
  const proposals = z
    .array(proposalRowSchema)
    .parse(data)
    .flatMap((row) => {
      const result = researchResultSchema.safeParse(row.result);
      if (!result.success) {
        invalid.push(row.id);
        return [];
      }
      const song = row.songs;
      return [
        {
          id: row.id,
          createdAt: row.created_at,
          provider: row.provider,
          model: row.model,
          result: result.data,
          song: {
            id: song.id,
            title: song.title,
            artist: song.artist,
            authors: song.authors,
            originalTitle: song.original_title,
            translator: song.translator,
            songbook: song.songbook,
            copyright: song.copyright,
            rightsStatus: song.rights_status,
            lyrics: songLyrics(
              song.arrangements.find((arrangement) => arrangement.is_default)?.chordpro ?? "",
            ),
          },
        },
      ];
    });

  if (invalid.length > 0) {
    console.error(`[song-rights] ${invalid.length} pending proposal(s) do not fit the schema.`);
    const { error: updateError } = await db
      .from("song_rights_proposals")
      .update({ status: "failed", error: "The saved result does not fit the schema." })
      .in("id", invalid)
      .eq("status", "pending");
    if (updateError) throw databaseError("close invalid song rights proposals", updateError);
  }
  return { proposals, total: Math.max(0, (count ?? 0) - invalid.length) };
}

/**
 * Accepts a proposal with the values that the song admin kept, or rejects it.
 * The nightly research never takes a rejected song again. False if the
 * proposal does not wait for a review (any more).
 */
export async function reviewRightsProposal(input: unknown): Promise<boolean> {
  const user = await requireSongAdmin();
  const { id, accept, changes } = parseInput(reviewInputSchema, input);

  const columns: Record<string, string | null> = {};
  for (const { key, column } of PROPOSAL_TEXT_FIELDS) {
    if (changes[key] !== undefined) columns[column] = changes[key];
  }
  if (changes.rightsStatus) columns.rights_status = changes.rightsStatus;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("review_song_rights_proposal", {
    p_id: id,
    p_user: user.id,
    p_accept: accept,
    p_changes: columns,
  });
  if (error) throw databaseError("review song rights proposal", error);
  return data === true;
}

// --- Local research --------------------------------------------------------

export type FindingsImportResult = {
  imported: number;
  /** The title (or the id) of each song that got no proposal. */
  skipped: string[];
};

/** The songs that wait for their first research, the same as the nightly research takes. */
export async function exportSongsForLocalResearch(): Promise<LocalResearchSongsFile> {
  await requireSuperadmin();
  const { data, error } = await (await getMusicSupabase()).rpc("songs_for_local_rights_research");
  if (error) throw databaseError("list songs for local rights research", error);
  const rows = z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        artist: z.string().nullable(),
        copyright: z.string().nullable(),
        songbook: z.string().nullable(),
        chordpro: z.string(),
      }),
    )
    .parse(data);

  return localResearchSongsFile(rows);
}

/**
 * Adds the findings of an uploaded file (see `docs/song-rights-findings.md`)
 * as proposals to review. Skips a song that does not exist, whose research
 * is running or waits for a review, or that already has a proposal with the
 * same result. Throws a `SafeError` if the file does not fit the format: then
 * no finding is added.
 */
export async function importResearchFindings(
  file: File | undefined,
): Promise<FindingsImportResult> {
  await requireSuperadmin();
  if (!file) throw new SafeError(({ m }) => m.songRights.upload.errors.chooseFile);
  if (file.size > RESEARCH_FINDINGS_MAX_BYTES) {
    throw new SafeError(({ m, format }) =>
      format(m.songRights.upload.errors.tooLarge, {
        max: RESEARCH_FINDINGS_MAX_BYTES / 1024 / 1024,
      }),
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new SafeError(({ m }) => m.songRights.upload.errors.notJson);
  }
  const parsed = researchFindingsSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const songId: unknown = issue!.code === "custom" ? issue.params?.duplicateSongId : undefined;
    if (typeof songId === "string") {
      throw new SafeError(({ m, format }) =>
        format(m.songRights.upload.errors.duplicate, { songId }),
      );
    }
    const path = issue!.path.join(".") || "root";
    throw new SafeError(({ m, format }) =>
      format(m.songRights.upload.errors.format, { path, message: issue!.message }),
    );
  }
  const { model, findings } = parsed.data;

  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("import_song_rights_findings", {
    p_model: model ?? DEFAULT_LOCAL_RESEARCH_MODEL,
    p_findings: findings.map((finding) => ({ song_id: finding.songId, result: finding.result })),
  });
  if (error) throw databaseError("import song rights findings", error);
  const imported = new Set(
    z
      .array(z.object({ song_id: z.string() }))
      .parse(data)
      .map((row) => row.song_id),
  );

  return {
    imported: imported.size,
    skipped: findings
      .filter((finding) => !imported.has(finding.songId))
      .map((finding) => finding.title || finding.songId),
  };
}

// --- Helpers ---------------------------------------------------------------

async function readSettings(): Promise<SettingsRow> {
  const { data, error } = await (
    await getMusicSupabase()
  )
    .from("song_rights_research_settings")
    .select("enabled, provider, model, nightly_limit, api_key_hint")
    .maybeSingle();
  if (error) throw databaseError("read song rights research settings", error);
  return data
    ? settingsRowSchema.parse(data)
    : {
        enabled: false,
        provider: null,
        model: null,
        nightly_limit: DEFAULT_RESEARCH_NIGHTLY_LIMIT,
        api_key_hint: null,
      };
}

// --- AI research (Churchy: platform key, per-plan cap) ---------------------

/** The longest research of one song (the request may run 300 seconds). */
const RESEARCH_TIMEOUT_MS = 240_000;
/** The error of a song without lyrics. After a change of the chart, the song goes again (`error_kind`). */
const NO_LYRICS_ERROR = "The song has no lyrics.";
/** The error of a research whose result the database did not take. */
const SAVE_FAILED_ERROR = "The result could not be saved.";

const runNowInputSchema = z.strictObject({
  count: z.coerce.number().int().min(RESEARCH_RUN_NOW_MIN).max(RESEARCH_RUN_NOW_MAX),
});

const claimRowSchema = z.object({
  proposal_id: z.string(),
  song_id: z.string(),
  title: z.string(),
  artist: z.string().nullable(),
  copyright: z.string().nullable(),
  songbook: z.string().nullable(),
  chordpro: z.string(),
});

export type ResearchBatchResult = { researched: number; failed: number };

/**
 * The AI research of this church this month: `limit` from the plan
 * (`entitlements().musicResearchPerMonth`), `used` the researches since the 1st (Europe/Budapest),
 * `available` whether the platform key is set (never in demo mode).
 */
export type ResearchQuotaDTO = { available: boolean; limit: number; used: number };

export async function getResearchQuota(): Promise<ResearchQuotaDTO> {
  await requireSuperadmin();
  const [limit, used] = await Promise.all([researchLimit(), researchesThisMonth()]);
  return { available: platformKey() !== null, limit, used };
}

/**
 * "Research now" on the song-rights page: the next `count` songs at the same time, at most what
 * is left of the month's cap. Waits for the results: up to 4 minutes.
 */
export async function runResearchNow(input: unknown): Promise<ResearchBatchResult> {
  await requireSuperadmin();
  const { count } = parseInput(runNowInputSchema, input);
  const configuration = await readConfiguration();
  const left = await researchesLeft();
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("claim_songs_for_rights_research_now", {
    p_count: Math.min(count, left),
    p_provider: configuration.provider,
    p_model: configuration.model,
  });
  if (error) throw databaseError("claim songs for rights research now", error);
  return batchResult(await researchClaimed(z.array(claimRowSchema).parse(data), configuration));
}

/**
 * Researches one song again, e.g. after a rejection or a failure. False if the song does not
 * exist. Throws a `SafeError` with the error if the research fails. Up to 4 minutes.
 */
export async function researchSongNow(input: unknown): Promise<boolean> {
  await requireSuperadmin();
  const songId = parseInput(idSchema, input);
  const configuration = await readConfiguration();
  await researchesLeft();

  const db = await getMusicSupabase();
  const { data: song, error: songError } = await db
    .from("songs")
    .select("id")
    .eq("id", songId)
    .maybeSingle();
  if (songError) throw databaseError("find song for rights research", songError);
  if (!song) return false;

  const { data, error } = await db.rpc("claim_song_for_rights_research", {
    p_song_id: songId,
    p_provider: configuration.provider,
    p_model: configuration.model,
  });
  if (error) throw databaseError("claim song for rights research", error);
  const [claimed] = z.array(claimRowSchema).parse(data);
  if (!claimed) throw new SafeError(({ m }) => m.songRights.errors.alreadyOpen);

  const [outcome] = await researchClaimed([claimed], configuration);
  if (outcome?.status === "failed") {
    const message = outcome.error;
    throw new SafeError(({ m, format }) => format(m.songRights.errors.researchFailed, { message }));
  }
  return true;
}

type Configuration = { provider: ResearchProvider; model: string; apiKey: string };
type ClaimedSong = z.infer<typeof claimRowSchema>;
type ResearchOutcome = { status: "pending" } | { status: "failed"; error: string };

function batchResult(outcomes: ResearchOutcome[]): ResearchBatchResult {
  return {
    researched: outcomes.filter((outcome) => outcome.status === "pending").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
  };
}

/**
 * Researches the claimed songs at the same time, and saves each result or error in its
 * proposal. A failed save fails only its song: the proposal stays running, and the next claim
 * closes it after 1 hour.
 */
async function researchClaimed(
  songs: ClaimedSong[],
  { provider, model, apiKey }: Configuration,
): Promise<ResearchOutcome[]> {
  const db = await getMusicSupabase();
  const year = new Date().getUTCFullYear();
  return Promise.all(
    songs.map(async (song): Promise<ResearchOutcome> => {
      let update:
        | { status: "pending"; result: ResearchResult }
        | { status: "failed"; error: string; error_kind: "no_lyrics" | ResearchErrorKind };
      if (!songLyrics(song.chordpro)) {
        update = { status: "failed", error: NO_LYRICS_ERROR, error_kind: "no_lyrics" };
      } else {
        try {
          const result = await runResearch({
            provider,
            model,
            apiKey,
            prompt: researchUserPrompt(song, year),
            signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
          });
          update = { status: "pending", result };
        } catch (cause) {
          if (!(cause instanceof ResearchError))
            console.error("[song-rights] Research failed:", cause);
          update =
            cause instanceof ResearchError
              ? { status: "failed", error: cause.message, error_kind: cause.kind }
              : { status: "failed", error: "Unexpected error.", error_kind: null };
        }
      }
      const { error } = await db
        .from("song_rights_proposals")
        .update(update)
        .eq("id", song.proposal_id);
      if (error) {
        // Logs the error.
        databaseError("save song rights proposal", error);
        return { status: "failed", error: SAVE_FAILED_ERROR };
      }
      return update.status === "pending"
        ? { status: "pending" }
        : { status: "failed", error: update.error };
    }),
  );
}

/** The platform key (server env), never in demo mode (the demo refuses to start with one). */
function platformKey(): string | null {
  if (demoModeEnabled()) return null;
  return process.env.ANTHROPIC_API_KEY || null;
}

/** Anthropic with the platform key and the saved (or default) model; a `SafeError` without a key. */
async function readConfiguration(): Promise<Configuration> {
  const apiKey = platformKey();
  if (!apiKey) throw new SafeError(({ m }) => m.songRights.aiOff.notReady);
  const settings = await readSettings();
  const model =
    settings.provider === "anthropic" && settings.model
      ? settings.model
      : DEFAULT_RESEARCH_MODELS.anthropic;
  return { provider: "anthropic", model, apiKey };
}

async function researchLimit(): Promise<number> {
  const { tenantId } = await getRequestContext();
  if (tenantId === undefined) return 0;
  const env = await getWorkspaceEnv();
  return (await entitlementsFor({ ...env.ctx, tenantId })).musicResearchPerMonth;
}

async function researchesThisMonth(): Promise<number> {
  const { data, error } = await (
    await getMusicSupabase()
  ).rpc("count_song_rights_researches_this_month");
  if (error) throw databaseError("count song rights researches", error);
  return z.number().parse(data);
}

/** What is left of the month's cap; a `SafeError` when nothing is. */
async function researchesLeft(): Promise<number> {
  const [limit, used] = await Promise.all([researchLimit(), researchesThisMonth()]);
  const left = limit - used;
  if (left <= 0)
    throw new SafeError(({ m, format }) => format(m.songRights.quota.reached, { limit }));
  return left;
}

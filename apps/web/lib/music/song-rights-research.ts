import type { SongRightsStatus } from "@/lib/music/song-rights";

// The nightly research of the song rights by an AI agent. Keep the providers
// and the limits in sync with the migration `song_rights_research`.

export const RESEARCH_PROVIDERS = ["anthropic", "openai", "google"] as const;

export type ResearchProvider = (typeof RESEARCH_PROVIDERS)[number];

/** The provider of a proposal: an AI provider, or `local` for an uploaded file of findings. */
export const PROPOSAL_PROVIDERS = [...RESEARCH_PROVIDERS, "local"] as const;

export type ProposalProvider = (typeof PROPOSAL_PROVIDERS)[number];

/** The model that the settings form suggests for each provider. The superadmin can type another one. */
export const DEFAULT_RESEARCH_MODELS: Record<ResearchProvider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5.5",
  google: "gemini-pro-latest",
};

/** The page of the provider where a superadmin makes an API key. */
export const RESEARCH_PROVIDER_KEY_URLS: Record<ResearchProvider, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
};

export const RESEARCH_MODEL_MAX_LENGTH = 100;
export const RESEARCH_NIGHTLY_LIMIT_MIN = 1;
export const RESEARCH_NIGHTLY_LIMIT_MAX = 100;
export const DEFAULT_RESEARCH_NIGHTLY_LIMIT = 20;
/**
 * The songs of one "Research now". They run at the same time, and the
 * request ends after 300 seconds: more songs give more rate limit errors.
 */
export const RESEARCH_RUN_NOW_MIN = 1;
export const RESEARCH_RUN_NOW_MAX = 20;
export const DEFAULT_RESEARCH_RUN_NOW_COUNT = 4;

/**
 * The files of the local research (see `docs/song-rights-findings.md`): the
 * download of the open songs, and the upload of the findings.
 */
export const RESEARCH_SONGS_FORMAT = "song-rights-songs";
export const RESEARCH_FINDINGS_FORMAT = "song-rights-findings";
export const RESEARCH_FILE_VERSION = 1;
/** The most findings in one upload. */
export const RESEARCH_FINDINGS_MAX = 200;
/** The largest file of findings. Keep it below `serverActions.bodySizeLimit` in `next.config.ts`. */
export const RESEARCH_FINDINGS_MAX_BYTES = 5 * 1024 * 1024;
/** The model of an uploaded proposal when the file names none. */
export const DEFAULT_LOCAL_RESEARCH_MODEL = "Local research";

export const RESEARCH_API_KEY_MIN_LENGTH = 8;
export const RESEARCH_API_KEY_MAX_LENGTH = 500;

export const RESEARCH_LEVELS = ["verified", "single source", "not found"] as const;
export type ResearchLevel = (typeof RESEARCH_LEVELS)[number];

export const RESEARCH_SONG_TYPES = ["hungarian_original", "translation", "old_hymn"] as const;
export const RESEARCH_CONFIDENCES = ["high", "medium", "low"] as const;

/** The statuses that a research can propose: only the church knows its licences and permissions. */
export const RESEARCH_RIGHTS_STATUSES = [
  "public_domain",
  "unknown",
] as const satisfies readonly SongRightsStatus[];
export type ResearchRightsStatus = (typeof RESEARCH_RIGHTS_STATUSES)[number];

/** The text fields of a proposal, in the order of the review, with the column of the song. */
export const PROPOSAL_TEXT_FIELDS = [
  { key: "authors", column: "authors" },
  { key: "originalTitle", column: "original_title" },
  { key: "translator", column: "translator" },
  { key: "songbook", column: "songbook" },
  { key: "copyright", column: "copyright" },
] as const;

export type ProposalTextField = (typeof PROPOSAL_TEXT_FIELDS)[number]["key"];
export type ProposalField = ProposalTextField | "rightsStatus";

export type ResearchFieldValue = {
  value: string | null;
  level: ResearchLevel;
  /** The numbers of the sources in `ResearchResult.sources`. */
  sources: number[];
};

/** The answer of the agent for one song. */
export type ResearchResult = {
  songType: (typeof RESEARCH_SONG_TYPES)[number];
  confidence: (typeof RESEARCH_CONFIDENCES)[number];
  authors: ResearchFieldValue;
  originalTitle: ResearchFieldValue;
  translator: ResearchFieldValue;
  songbook: ResearchFieldValue;
  copyright: ResearchFieldValue;
  rightsStatus: { value: ResearchRightsStatus; reason: string };
  rightsHolders: string;
  openQuestions: string;
  sources: { number: number; url: string; title: string }[];
  /** The searches that the agent ran. */
  queries: string[];
};

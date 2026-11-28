import "server-only";

import { z } from "zod";

import { SONG_RIGHTS_STATUSES } from "@/lib/music/song-rights";
import {
  RESEARCH_CONFIDENCES,
  RESEARCH_FILE_VERSION,
  RESEARCH_FINDINGS_FORMAT,
  RESEARCH_FINDINGS_MAX,
  RESEARCH_LEVELS,
  RESEARCH_MODEL_MAX_LENGTH,
  RESEARCH_RIGHTS_STATUSES,
  RESEARCH_SONG_TYPES,
  type ResearchResult,
  type ResearchRightsStatus,
} from "@/lib/music/song-rights-research";

// The answer of the agent: a JSON schema for the providers, and a Zod schema
// that checks what comes back. The values can be longer than the limits of
// the song: the review shows the length, and the superadmin shortens them.

/** The longest text that the app keeps from the agent, against runaway answers. */
const TEXT_MAX = 2000;
const LIST_MAX = 60;

const text = z.string().trim().max(TEXT_MAX);

const fieldSchema = z.object({
  value: text.nullable().transform((value) => value || null),
  level: z.enum(RESEARCH_LEVELS),
  sources: z.array(z.number().int()).max(LIST_MAX),
});

export const researchResultSchema: z.ZodType<ResearchResult> = z.object({
  songType: z.enum(RESEARCH_SONG_TYPES),
  confidence: z.enum(RESEARCH_CONFIDENCES),
  authors: fieldSchema,
  originalTitle: fieldSchema,
  translator: fieldSchema,
  songbook: fieldSchema,
  copyright: fieldSchema,
  rightsStatus: z.object({
    // The other statuses of the song form become `unknown`: the agent cannot know the licences of the church.
    value: z
      .enum(SONG_RIGHTS_STATUSES)
      .transform((value): ResearchRightsStatus => (value === "public_domain" ? value : "unknown")),
    reason: text,
  }),
  rightsHolders: text,
  openQuestions: text,
  sources: z
    .array(
      z.object({ number: z.number().int(), url: z.string().trim().max(TEXT_MAX), title: text }),
    )
    .max(LIST_MAX),
  queries: z.array(text).max(LIST_MAX),
});

/**
 * An uploaded file of findings from a local research (see
 * `docs/song-rights-findings.md`). Other keys are allowed and ignored, e.g.
 * the lyrics of the download of the open songs.
 */
export const researchFindingsSchema = z.object({
  format: z.literal(RESEARCH_FINDINGS_FORMAT),
  version: z.literal(RESEARCH_FILE_VERSION),
  model: z.string().trim().min(1).max(RESEARCH_MODEL_MAX_LENGTH).optional(),
  findings: z
    .array(
      z.object({ songId: z.uuid(), title: z.string().optional(), result: researchResultSchema }),
    )
    .min(1)
    .max(RESEARCH_FINDINGS_MAX)
    .superRefine((findings, context) => {
      const seen = new Set<string>();
      for (const [index, { songId }] of findings.entries()) {
        if (seen.has(songId)) {
          context.addIssue({
            code: "custom",
            path: [index, "songId"],
            message: `The song ${songId} is in the file more than once.`,
            params: { duplicateSongId: songId },
          });
        }
        seen.add(songId);
      }
    }),
});

const FIELD_JSON_SCHEMA = {
  type: "object",
  properties: {
    value: { type: ["string", "null"], description: "The proposed value, or null if not found." },
    level: { type: "string", enum: [...RESEARCH_LEVELS] },
    sources: {
      type: "array",
      items: { type: "integer" },
      description: "Numbers of the URLs in `sources`.",
    },
  },
  required: ["value", "level", "sources"],
  additionalProperties: false,
};

/** In the strict form of OpenAI and Anthropic: every property required, no others. */
export const RESEARCH_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    songType: { type: "string", enum: [...RESEARCH_SONG_TYPES] },
    confidence: { type: "string", enum: [...RESEARCH_CONFIDENCES] },
    authors: FIELD_JSON_SCHEMA,
    originalTitle: FIELD_JSON_SCHEMA,
    translator: FIELD_JSON_SCHEMA,
    songbook: FIELD_JSON_SCHEMA,
    copyright: FIELD_JSON_SCHEMA,
    rightsStatus: {
      type: "object",
      properties: {
        value: { type: "string", enum: [...RESEARCH_RIGHTS_STATUSES] },
        reason: { type: "string" },
      },
      required: ["value", "reason"],
      additionalProperties: false,
    },
    rightsHolders: { type: "string" },
    openQuestions: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "integer" },
          url: { type: "string" },
          title: { type: "string" },
        },
        required: ["number", "url", "title"],
        additionalProperties: false,
      },
    },
    queries: { type: "array", items: { type: "string" } },
  },
  required: [
    "songType",
    "confidence",
    "authors",
    "originalTitle",
    "translator",
    "songbook",
    "copyright",
    "rightsStatus",
    "rightsHolders",
    "openQuestions",
    "sources",
    "queries",
  ],
  additionalProperties: false,
} as const;

/** Checks a parsed answer. Throws a short message for the proposal when it does not fit. */
export function checkResearchResult(value: unknown): ResearchResult {
  const result = researchResultSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `The answer does not fit the schema (${issue!.path.join(".") || "root"}: ${issue!.message}).`,
    );
  }
  return result.data;
}

/**
 * The JSON object in a text answer: the whole text, a ```json block, or the
 * text from the first `{` to the last `}`.
 */
export function parseResearchJson(answer: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer)?.[1];
  const start = answer.indexOf("{");
  const end = answer.lastIndexOf("}");
  const candidates = [
    answer.trim(),
    fenced?.trim(),
    start >= 0 && end > start ? answer.slice(start, end + 1) : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // The next form.
    }
  }
  throw new Error("The answer has no JSON object.");
}

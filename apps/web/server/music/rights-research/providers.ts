import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { ResearchProvider, ResearchResult } from "@/lib/music/song-rights-research";
import { RESEARCH_SYSTEM_PROMPT } from "./prompt";
import { checkResearchResult, RESEARCH_RESULT_JSON_SCHEMA } from "./result";

// One research request to the AI provider: the agent searches the web with the search tool of
// the provider and answers in the JSON of `result.ts`. Churchy (PLAN §14): Anthropic only, with
// the platform key from the server env (`ANTHROPIC_API_KEY`); the OpenAI and Google parts of the
// music app are left out.

export type ResearchRequest = {
  provider: ResearchProvider;
  model: string;
  apiKey: string;
  /** The message for the song (`researchUserPrompt()`). */
  prompt: string;
  signal: AbortSignal;
};

/**
 * The kind of a failure, as `song_rights_proposals.error_kind`:
 * - `temporary`: a network error, a timeout, a rate limit or an error of the
 *   servers of the provider. The nightly research takes the song again, at
 *   most 3 times.
 * - `provider`: the provider refused the request, e.g. a wrong API key or
 *   model, or no credit. Usually the fault is not in the song: the nightly
 *   research takes it again. It counts for the 3 times only when the
 *   provider took a later research of another song with the same model, e.g.
 *   after a content filter (see `songs_for_rights_research()`).
 * - null: an error with the answer of the model. The song does not go again.
 */
export type ResearchErrorKind = "temporary" | "provider" | null;

/** An error to keep with the proposal. It never contains the API key. */
export class ResearchError extends Error {
  readonly kind: ResearchErrorKind;

  constructor(message: string, kind: ResearchErrorKind = null) {
    super(message);
    this.name = "ResearchError";
    this.kind = kind;
  }
}

export async function runResearch(request: ResearchRequest): Promise<ResearchResult> {
  try {
    switch (request.provider) {
      case "anthropic":
        return await researchWithAnthropic(request);
      default:
        throw new Error(`Provider ${request.provider} is not available in Churchy.`);
    }
  } catch (error) {
    throw new ResearchError(errorMessage(error), errorKind(error));
  }
}

/** A short request without web search: checks the key and the model. Throws a `ResearchError`. */
export async function testProvider(
  provider: ResearchProvider,
  model: string,
  apiKey: string,
): Promise<void> {
  const signal = AbortSignal.timeout(30_000);
  try {
    switch (provider) {
      case "anthropic":
        await new Anthropic({ apiKey }).messages.create(
          { model, max_tokens: 16, messages: [{ role: "user", content: "Say OK." }] },
          { signal, maxRetries: 0 },
        );
        return;
    }
  } catch (error) {
    throw new ResearchError(errorMessage(error));
  }
}

// --- Anthropic -----------------------------------------------------------

const SUBMIT_TOOL = "submit_result";
/** The server tools run in a loop that can pause. Each pause costs one more request. */
const MAX_ANTHROPIC_REQUESTS = 8;
/** The models that take `fallbacks: "default"`: another model answers when the safety classifiers decline. */
const FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

async function researchWithAnthropic({
  model,
  apiKey,
  prompt,
  signal,
}: ResearchRequest): Promise<ResearchResult> {
  const client = new Anthropic({ apiKey });
  const fallback = FALLBACK_MODELS.has(model);
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 20 },
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: 15, max_content_tokens: 30_000 },
    {
      name: SUBMIT_TOOL,
      description: "Gives the final result of the research. Call it once, at the end.",
      input_schema: RESEARCH_RESULT_JSON_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `${prompt}\n\nWhen you are done, call ${SUBMIT_TOOL} with the result.`,
    },
  ];

  for (let request = 0; request < MAX_ANTHROPIC_REQUESTS; request++) {
    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: 16_000,
        system: [
          { type: "text", text: RESEARCH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        ],
        tools,
        messages,
        output_config: { effort: "medium" },
        ...(fallback && {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }),
      },
      { signal },
    );

    if (response.stop_reason === "refusal") throw new Error("The model declined the request.");
    const submitted = response.content.find(
      (block) => block.type === "tool_use" && block.name === SUBMIT_TOOL,
    );
    if (submitted?.type === "tool_use") return checkResearchResult(submitted.input);

    messages.push({ role: "assistant", content: response.content });
    // A pause of the server tools: the same messages again resume the turn.
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason === "max_tokens") throw new Error("The answer was too long.");
    messages.push({
      role: "user",
      content: `Call ${SUBMIT_TOOL} now with the result of the research.`,
    });
  }
  throw new Error("The model did not give a result.");
}

/** The longest error message that a proposal keeps. */
const ERROR_MAX_LENGTH = 500;

const TEMPORARY_STATUSES = new Set([408, 409, 429]);

/** See `ResearchErrorKind`. The errors that are not of the provider come from the answer of the model. */
export function errorKind(error: unknown): ResearchErrorKind {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
    return "temporary";
  // A network error of `fetch()`: the Google SDK does not wrap it.
  if (error instanceof TypeError && error.message === "fetch failed") return "temporary";
  if (error instanceof Anthropic.APIError) {
    // No status: a network error of the SDK.
    const status: number | undefined = error.status;
    return status === undefined || status >= 500 || TEMPORARY_STATUSES.has(status)
      ? "temporary"
      : "provider";
  }
  return null;
}

/** A short message for the proposal and the settings page. */
function errorMessage(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The research took too long and stopped.";
  }
  let message: string;
  if (error instanceof Anthropic.APIError) {
    message = `${error.status ?? "network"}: ${error.message}`;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  return message.slice(0, ERROR_MAX_LENGTH) || "Unknown error.";
}

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { LlmPlanSchema, planJsonSchema, type LlmPlan } from "./plan-schema";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * The model seam of the site builder. `AnthropicPlanner` is the real one (platform key from the
 * server env, like the music rights research); tests, demo mode and e2e use `FakePlanner` and never
 * touch the network or the key.
 */

export const SITE_BUILDER_MODEL = "claude-sonnet-5-5";
/** USD per million tokens of `claude-sonnet-5-5`. */
export const PRICE = { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.1 } as const;

export interface PlanUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
}
export interface PlanResult {
  readonly plan: LlmPlan;
  readonly usage: PlanUsage;
}
export interface Planner {
  readonly model: string;
  plan(userPrompt: string, signal?: AbortSignal): Promise<PlanResult>;
}

export const costUsd = (u: PlanUsage): number =>
  (u.inputTokens * PRICE.inputPerM +
    u.outputTokens * PRICE.outputPerM +
    u.cacheReadTokens * PRICE.cacheReadPerM) /
  1_000_000;

export class PlannerError extends Error {
  constructor(
    readonly kind: "refused" | "invalid" | "provider" | "temporary" | "timeout",
    message: string,
  ) {
    super(message);
    this.name = "PlannerError";
  }
}

const SUBMIT_TOOL = "submit_plan";
const MAX_REQUESTS = 3;

export class AnthropicPlanner implements Planner {
  readonly model = SITE_BUILDER_MODEL;
  constructor(private readonly apiKey: string) {}

  async plan(
    userPrompt: string,
    signal: AbortSignal = AbortSignal.timeout(180_000),
  ): Promise<PlanResult> {
    const client = new Anthropic({ apiKey: this.apiKey });
    const tools: Anthropic.Beta.BetaToolUnion[] = [
      {
        name: SUBMIT_TOOL,
        description: "Gives the final plan for the draft site. Call it once.",
        input_schema: planJsonSchema() as unknown as Anthropic.Beta.BetaTool.InputSchema,
        strict: true,
      },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userPrompt }];
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    try {
      for (let i = 0; i < MAX_REQUESTS; i++) {
        const response = await client.beta.messages.create(
          {
            model: this.model,
            max_tokens: 16_000,
            // The system prompt is identical for every run: cached.
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            tools,
            messages,
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          },
          { signal, maxRetries: 2 },
        );
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;
        cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
        if (response.stop_reason === "refusal")
          throw new PlannerError("refused", "The model declined.");
        const call = response.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_TOOL);
        if (call?.type === "tool_use") {
          const parsed = LlmPlanSchema.safeParse(call.input);
          if (!parsed.success)
            throw new PlannerError("invalid", "The plan did not match the schema.");
          return { plan: parsed.data, usage: { inputTokens, outputTokens, cacheReadTokens } };
        }
        if (response.stop_reason === "max_tokens")
          throw new PlannerError("invalid", "The plan was too long.");
        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: `Call ${SUBMIT_TOOL} now.` });
      }
    } catch (error) {
      if (error instanceof PlannerError) throw error;
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        throw new PlannerError("timeout", "The model took too long.");
      }
      if (error instanceof Anthropic.APIError) {
        const status: number | undefined = error.status;
        const temporary =
          status === undefined ||
          status >= 500 ||
          status === 408 ||
          status === 409 ||
          status === 429;
        throw new PlannerError(
          temporary ? "temporary" : "provider",
          `provider ${status ?? "network"}`,
        );
      }
      throw new PlannerError("provider", "unexpected provider error");
    }
    throw new PlannerError("invalid", "The model gave no plan.");
  }
}

/** Deterministic planner for tests, demo mode and e2e: returns a canned plan, no network. */
export class FakePlanner implements Planner {
  readonly model = "fake";
  calls = 0;
  constructor(private readonly make: (prompt: string) => LlmPlan | Promise<LlmPlan>) {}
  async plan(userPrompt: string): Promise<PlanResult> {
    this.calls++;
    const plan = LlmPlanSchema.parse(await this.make(userPrompt));
    return {
      plan,
      usage: {
        inputTokens: Math.ceil(userPrompt.length / 3),
        outputTokens: 1200,
        cacheReadTokens: 0,
      },
    };
  }
}

import { parseImportUrl, type ImportStage } from "@churchy/contracts";
import { z } from "zod";
import { writeSiteBuilderAudit } from "@/server/platform-db";
import { isUuid } from "@/server/platform-db/queries";
import { withPolicyRoute, type PolicyScope } from "@/server/policy";
import { buildDraft } from "@/server/site-builder/pipeline";
import {
  buildDepsFor,
  draftStoreFor,
  siteBuilderMode,
  startUrlFor,
} from "@/server/site-builder-run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs the URL -> draft site build for a platform operator and streams its progress as NDJSON, one
 * event per line: `{type:"stage"…}` while it runs, then exactly one of `{type:"draft", id}` or
 * `{type:"failed", code}`. A route handler, not a pg-boss job: a build is short-lived (a crawl of at
 * most 30 pages and one model call), the operator waits for it and sees its stages, and the result
 * is stored as a draft that expires anyway (docs/runbooks/site-builder.md).
 */

const BodySchema = z.object({
  url: z.string().max(2000),
  /** "The church asked us to prepare its site from this address." */
  consent: z.literal(true),
  note: z.string().max(300).nullish(),
  /** Existing church the owner will apply the draft to; absent = a new church. */
  /** A uuid in live mode; demo churches have readable ids. */
  targetTenantId: z.string().min(1).max(100).nullish(),
});

/** At most this many builds at once on one server (each may spend model tokens). */
const MAX_CONCURRENT = 2;
let running = 0;

type Event =
  | { type: "stage"; stage: ImportStage; status: "started" | "completed"; count?: number }
  | { type: "draft"; id: string }
  | { type: "failed"; code: string };

const line = (event: Event) => new TextEncoder().encode(`${JSON.stringify(event)}\n`);
const failed = (code: string, status = 400) =>
  new Response(line({ type: "failed", code }), {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });

export const POST = withPolicyRoute(
  "platform.siteBuilder.use",
  (_scope: PolicyScope, _request: Request) => ({ kind: "platform" as const }),
  async (scope, request: Request) => {
    const mode = siteBuilderMode();
    if (mode === "off") return failed("unavailable", 503);
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return failed("invalid_request");
    }
    const body = BodySchema.safeParse(json);
    if (!body.success) {
      const consentMissing = body.error.issues.some((i) => i.path[0] === "consent");
      return failed(consentMissing ? "no_consent" : "invalid_request");
    }
    const target = body.data.targetTenantId ?? null;
    if (mode === "live" && target !== null && !isUuid(target)) return failed("invalid_request");
    const normalized = parseImportUrl(body.data.url);
    if (!normalized) return failed("invalid_url");
    if (running >= MAX_CONCURRENT) return failed("busy", 429);

    const operatorId = scope.actor.kind === "platform" ? scope.actor.userId : "";
    const store = draftStoreFor(mode, operatorId);
    const startUrl = startUrlFor(mode, normalized);
    const deps = buildDepsFor(mode, startUrl, request.signal);
    if (!store || !deps) return failed("unavailable", 503);

    running++;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: Event) => controller.enqueue(line(e));
        try {
          const result = await buildDraft(
            {
              startUrl,
              operatorId,
              consent: body.data.consent,
              consentNote: body.data.note ?? null,
            },
            { ...deps, onProgress: (e) => send({ type: "stage", ...e }) },
          );
          if (!result.ok) {
            send({ type: "failed", code: result.code });
            return;
          }
          const stored = await store.create(result.draft, {
            targetTenantId: target,
          });
          if (mode === "live") {
            // Ids, the host and counts only: no texts, no operator note, no personal data.
            await writeSiteBuilderAudit(operatorId, "site_builder.build", stored.id, {
              host: new URL(startUrl).hostname,
              consent: true,
              hasNote: Boolean(body.data.note),
              pages: result.draft.pages.length,
              posts: result.draft.posts.length,
              images: result.draft.images.length,
              costUsd: result.draft.meta.usage.costUsd,
              warnings: result.draft.warnings.length,
            });
          }
          send({ type: "draft", id: stored.id });
        } catch {
          send({ type: "failed", code: "error" });
        } finally {
          running--;
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  },
);

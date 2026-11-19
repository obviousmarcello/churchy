import type { NextRequest } from "next/server";
import { getImportJob } from "@/server/data-adapters";
import { canRunSetupImport } from "@/server/setup";

export const dynamic = "force-dynamic";

/**
 * Streams the first-setup import job (D-34) as NDJSON, one `ImportEvent` per line, so the wizard
 * can show each stage as it completes. `GET ?url=` only reads: today the job is the scripted mock
 * (no network access); a real importer replaces it behind `getImportJob()` without changing this
 * route or the wizard.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!(await canRunSetupImport())) return new Response(null, { status: 404 });
  const url = request.nextUrl.searchParams.get("url") ?? "";
  const events = getImportJob().start(url, { signal: request.signal });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

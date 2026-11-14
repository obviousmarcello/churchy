import { devRoutesHidden } from "@/lib/dev-routes";
import { listOutbox } from "@/server/data-adapters";
import { getRequestDemoSessionId } from "@/server/repositories";

// Evaluated per request: the outbox changes and HIDE_DEV_ROUTES is read at runtime.
export const dynamic = "force-dynamic";

/**
 * Tiny change marker of the demo outbox, polled by the viewer (`<LiveRefresh>`) so it can refresh
 * the page as soon as an entry is added or the outbox is cleared. Carries no message content.
 */
export async function GET(): Promise<Response> {
  if (devRoutesHidden()) return new Response(null, { status: 404 });
  const messages = listOutbox(await getRequestDemoSessionId());
  const last = messages.at(-1);
  return Response.json(
    { revision: `${messages.length}:${last?.id ?? ""}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}

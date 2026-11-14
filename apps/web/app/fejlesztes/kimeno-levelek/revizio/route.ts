import { devRoutesHidden } from "@/lib/dev-routes";
import { listOutbox } from "@/server/data-adapters";

// Evaluated per request: the outbox changes and HIDE_DEV_ROUTES is read at runtime.
export const dynamic = "force-dynamic";

/**
 * Tiny change marker of the demo outbox, polled by the viewer (`<LiveRefresh>`) so it can refresh
 * the page as soon as an entry is added or the outbox is cleared. Carries no message content.
 */
export function GET(): Response {
  if (devRoutesHidden()) return new Response(null, { status: 404 });
  const messages = listOutbox();
  const last = messages.at(-1);
  return Response.json(
    { revision: `${messages.length}:${last?.id ?? ""}` },
    { headers: { "Cache-Control": "no-store" } },
  );
}

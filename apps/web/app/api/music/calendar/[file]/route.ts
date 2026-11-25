import { feedClient } from "@/server/music/feed-client";
import { readCalendarFeed } from "@/server/music/models/calendar-feeds";
import { getRequestContext } from "@/server/session";

// The calendar feed of a user: `/api/music/calendar/<token>.ics`, the events that the user volunteers
// for. Calendar apps fetch it without a session; the secret token in the path is the only check, looked
// up in the church of the host (the proxy skips `.ics`). A user makes the link on the calendar page.
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file.endsWith(".ics")) return new Response(null, { status: 404 });
  const token = file.slice(0, -".ics".length);

  let calendar: string | null;
  try {
    const { tenantId } = await getRequestContext();
    const client = tenantId === undefined ? null : feedClient(tenantId);
    if (client === null) return new Response(null, { status: 404 });
    calendar = await readCalendarFeed(client, token, new URL(request.url).origin);
  } catch (error) {
    console.error("[calendar] Failed to read a calendar feed:", error);
    // The calendar app tries again later and keeps the events it has.
    return new Response(null, { status: 503 });
  }
  if (calendar === null) return new Response(null, { status: 404 });
  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="events.ics"',
      // The file holds the events of one user: no shared cache keeps it.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

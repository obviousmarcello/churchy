import { SafeError } from "@/server/music/errors";
import { closeProjectionController } from "@/server/music/models/event-sync";
import { musicProjection } from "@/server/music/policy";
import { withPolicyRoute } from "@/server/policy";

// The controller of an event's projection closed (see `useControllerHeartbeat` in
// `../event-controller.tsx`). The page sends it with `navigator.sendBeacon()` when the tab closes:
// the browser cancels a Server Action then. The form has `eventId` and `controllerId`. The module
// "projection" must be on (its turn-off removes the rows of the controllers).
export const POST = withPolicyRoute(
  "music.projection.use",
  (scope) => musicProjection(scope),
  async (_scope, request) => {
    // Only the pages of this site: another site must not close a controller.
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return new Response(null, { status: 403 });

    try {
      const form = await request.formData();
      const eventId = form.get("eventId");
      const controllerId = form.get("controllerId");
      await closeProjectionController(
        typeof eventId === "string" ? eventId : "",
        typeof controllerId === "string" ? controllerId : "",
      );
    } catch (error) {
      if (error instanceof SafeError) return new Response(null, { status: 400 });
      console.error("[projection] Failed to tell that the controller closed:", error);
      return new Response(null, { status: 500 });
    }
    return new Response(null, { status: 204 });
  },
);

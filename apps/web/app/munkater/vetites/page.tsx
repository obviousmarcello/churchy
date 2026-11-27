import type { Metadata } from "next";
import { Suspense } from "react";

import { getI18n } from "@/i18n/music/server";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import {
  getEventProjection,
  getEventProjectionConnection,
} from "@/server/music/models/projections";
import { canProjectEvent } from "@/server/music/models/realtime-access";
import type { ProjectionPageProps } from "./page-props";
import { EventProjectionController } from "./event-controller";
import { ProjectionGate, ProjectionLoading } from "./gate";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.project.page.metadataTitle };
}

// The controller of a projection, a full-screen page (see `isFullScreenPath`).
// Open it with one of (see `projectionHref`):
// - `?event=<id>`: the items of the event. For its volunteers, the music
//   leaders and the superadmins. Screens on other devices work too.
// // The screen is `/munkater/vetites/kepernyo` with the same query.
export default function ProjectPage({ searchParams }: ProjectionPageProps) {
  return (
    <Suspense fallback={<ProjectionLoading />}>
      <Controller searchParams={searchParams} />
    </Suspense>
  );
}

async function Controller({ searchParams }: ProjectionPageProps) {
  const [params, user] = await Promise.all([searchParams, requirePageUser()]);
  // The ids in the database and in the Realtime topics are lower case (see `projection_access()`).
  const eventId = firstParam(params.event)?.toLowerCase();

  if (eventId) {
    if (!(await canProjectEvent(eventId))) return <ProjectionGate reason="forbidden" />;
    const [projection, connection] = await Promise.all([
      getEventProjection(eventId),
      getEventProjectionConnection(eventId),
    ]);
    if (!projection || !connection) return <ProjectionGate reason="notFound" />;
    return (
      <EventProjectionController
        projection={projection}
        connection={connection}
        canEditItems={user.canEditEvents}
      />
    );
  }

  // `?rehearsal` (the projection of a rehearsal list in one browser) comes with the rehearsal page.
  return <ProjectionGate reason="noSource" />;
}

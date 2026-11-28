import type { Metadata } from "next";
import { Suspense } from "react";

import { getI18n } from "@/i18n/music/server";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import { getEventProjectionConnection } from "@/server/music/models/projections";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { ProjectionGate, ProjectionLoading } from "../gate";
import type { ProjectionPageProps } from "../page-props";
import { ProjectionScreen } from "../screen";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.project.page.screenMetadataTitle };
}

// A screen of a projection, e.g. on a projector: a full-screen page (see
// `isFullScreenPath`). Open it with the query of the controller (see
// `projectionScreenHref`): `?event=<id>` on any device of a user with access,
// `?rehearsal` in the browser of the controller.
export default function ProjectionScreenPage({ searchParams }: ProjectionPageProps) {
  return (
    <Suspense fallback={<ProjectionLoading />}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: ProjectionPageProps) {
  const [params] = await Promise.all([searchParams, requirePageUser()]);
  // As in the controller: the ids in the Realtime topics are lower case.
  const eventId = firstParam(params.event)?.toLowerCase();

  if (eventId) {
    // The policies of the channel check that the event exists.
    const connection = await getEventProjectionConnection(eventId);
    if (!connection) return <ProjectionGate reason="forbidden" />;
    return <ProjectionScreen channel={{ eventId, connection }} />;
  }

  if (params.rehearsal !== undefined) {
    // As in the controller: the projection of a rehearsal is a part of the module "rehearsal".
    await requireWorkspaceModule("ws.music.rehearsal");
    return <ProjectionScreen channel={{ eventId: null, connection: null }} />;
  }
  return <ProjectionGate reason="noSource" />;
}

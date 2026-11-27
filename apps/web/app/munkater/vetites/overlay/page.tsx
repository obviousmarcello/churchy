import type { Metadata } from "next";
import { Suspense } from "react";

import { getI18n } from "@/i18n/music/server";
import { parseOverlayBackground } from "@/lib/music/projection/overlay";
import { firstParam } from "@/lib/music/song-filters";
import { requirePageUser } from "@/server/music/auth";
import { getEventProjectionConnection } from "@/server/music/models/projections";
import { ProjectionGate, ProjectionLoading } from "../gate";
import type { ProjectionPageProps } from "../page-props";
import { ProjectionOverlay } from "../overlay";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.project.page.overlayMetadataTitle };
}

// The stream overlay of an event's projection, in full screen on a computer
// that sends it to a video switcher, e.g. an ATEM: a full-screen page (see
// `isFullScreenPath`).
// Open it with `?event=<id>` and an optional `&background=green` (see
// `projectionOverlayHref`), on any device of a user with access. Not for a
// rehearsal: the overlay is on another computer than the controller.
export default function ProjectionOverlayPage({ searchParams }: ProjectionPageProps) {
  return (
    <Suspense fallback={<ProjectionLoading />}>
      <Overlay searchParams={searchParams} />
    </Suspense>
  );
}

async function Overlay({ searchParams }: ProjectionPageProps) {
  const [params] = await Promise.all([searchParams, requirePageUser()]);
  // As in the controller: the ids in the Realtime topics are lower case.
  const eventId = firstParam(params.event)?.toLowerCase();
  if (!eventId) return <ProjectionGate reason="noSource" />;

  // The policies of the channel check that the event exists.
  const connection = await getEventProjectionConnection(eventId);
  if (!connection) return <ProjectionGate reason="forbidden" />;
  return (
    <ProjectionOverlay
      channel={{ eventId, connection }}
      background={parseOverlayBackground(firstParam(params.background))}
    />
  );
}

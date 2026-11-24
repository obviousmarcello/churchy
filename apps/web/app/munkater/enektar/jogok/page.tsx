import type { Metadata } from "next";
import { LockIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { demoModeEnabled } from "@/lib/demo/flag";
import { requirePageUser } from "@/server/music/auth";
import { getResearchSettings } from "@/server/music/models/song-rights-research";
import { requireWorkspaceModule } from "@/server/workspace-nav";
import { ResearchSettings } from "./research-settings";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songRights.page.title, robots: { index: false, follow: false } };
}

/** *Dalok jogai* (Music Sheet DB's song-rights page): `music.songRights.manage`. */
export default async function SongRightsPage() {
  const user = await requirePageUser();
  await requireWorkspaceModule("ws.music.song-rights");
  const { m } = await getI18n();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title={m.songRights.page.title}
        back={{ href: "/munkater/enektar", label: m.common.nav.songs }}
      />
      {/* The gate only hides the page. The model functions check the user again. */}
      {user.isSuperadmin ? (
        <div className="px-4 py-6 sm:px-6">
          <ResearchSettings settings={await getResearchSettings()} demo={demoModeEnabled()} />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songRights.gate.forbidden.title}</EmptyTitle>
            <EmptyDescription>{m.songRights.gate.forbidden.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

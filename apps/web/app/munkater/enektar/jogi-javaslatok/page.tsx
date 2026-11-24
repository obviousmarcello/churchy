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
import { requirePageUser } from "@/server/music/auth";
import { listRightsProposals } from "@/server/music/models/song-rights-research";
import { ProposalList } from "./proposal-list";

// The rights that the research proposes (see `/munkater/enektar/jogok`). The song admins
// (`music.song.manage`) review them here.

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.songRights.proposals.title, robots: { index: false, follow: false } };
}

export default async function RightsProposalsPage() {
  const [user, { m }] = await Promise.all([requirePageUser(), getI18n()]);

  return (
    <main className="flex flex-1 flex-col">
      <PageHeader
        title={m.songRights.proposals.title}
        back={{ href: "/munkater/enektar", label: m.common.nav.songs }}
      />
      {/* The gate only hides the page. The model functions check the song admin role again. */}
      {user.canEditSongs ? (
        <div className="px-4 py-6 sm:px-6">
          <ProposalList {...await listRightsProposals()} />
        </div>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>{m.songRights.reviewGate.forbidden.title}</EmptyTitle>
            <EmptyDescription>{m.songRights.reviewGate.forbidden.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}

import Link from "next/link";
import { CalendarXIcon, LockIcon, MonitorIcon } from "lucide-react";

import { buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";

/** Why a projection page cannot open. */
export type ProjectionGateReason = "forbidden" | "notFound" | "noSource";

/** The page of a projection that cannot open, with a link to where it can. */
export async function ProjectionGate({ reason }: { reason: ProjectionGateReason }) {
  const { m } = await getI18n();
  const t = m.project.gate;
  const content = {
    forbidden: { icon: <LockIcon />, title: t.forbiddenTitle, description: t.forbiddenDescription },
    notFound: {
      icon: <CalendarXIcon />,
      title: t.notFoundTitle,
      description: t.notFoundDescription,
    },
    noSource: { icon: <MonitorIcon />, title: t.noSourceTitle, description: t.noSourceDescription },
  }[reason];

  return (
    <main className="flex h-dvh flex-col">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{content.icon}</EmptyMedia>
          <EmptyTitle>{content.title}</EmptyTitle>
          <EmptyDescription>{content.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/events" className={buttonVariants({ variant: "outline" })}>
            {t.goToEvents}
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  );
}

/** While a projection page loads. */
export async function ProjectionLoading() {
  const { m } = await getI18n();
  return (
    <main className="flex h-dvh items-center justify-center">
      <p className="text-sm text-muted">{m.project.page.loading}</p>
    </main>
  );
}

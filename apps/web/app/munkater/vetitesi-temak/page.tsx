import type { Metadata } from "next";
import { Suspense } from "react";
import { LockIcon, LogInIcon } from "lucide-react";

import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { getCurrentUser } from "@/server/music/auth";
import { listProjectionThemes } from "@/server/music/models/projection-themes";
import { ThemeBrowser } from "./theme-browser";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.projectionThemes.page.title };
}

// The library of the projection themes, for the event admins and the
// superadmins (see `src/server/models/projection-themes.ts`).
export default async function ProjectionThemesPage() {
  const { m } = await getI18n();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={m.projectionThemes.page.title} />

      {/* Reads the session cookie, so it renders at request time. */}
      <Suspense
        fallback={
          <p className="px-4 py-6 text-sm text-muted sm:px-6">
            {m.projectionThemes.page.checkingAccess}
          </p>
        }
      >
        <Themes />
      </Suspense>
    </div>
  );
}

// The gate only hides the page. The model functions check the event admin role again.
async function Themes() {
  const [user, { m }] = await Promise.all([getCurrentUser(), getI18n()]);

  if (!user || !user.canEditEvents) {
    const gate = user ? m.projectionThemes.gate.forbidden : m.projectionThemes.gate.signIn;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{user ? <LockIcon /> : <LogInIcon />}</EmptyMedia>
          <EmptyTitle>{gate.title}</EmptyTitle>
          <EmptyDescription>{gate.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const themes = await listProjectionThemes();
  return <ThemeBrowser themes={themes} canSetDefault={user.canSetDefaultTheme} />;
}

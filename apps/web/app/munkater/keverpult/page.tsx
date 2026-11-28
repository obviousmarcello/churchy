import type { Metadata } from "next";
import { Suspense } from "react";
import { LockIcon, LogInIcon } from "lucide-react";

import { FormSkeleton } from "@/components/music/loading-skeletons";
import { PageHeader } from "@/components/music/page-header";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { getI18n } from "@/i18n/music/server";
import { canServer } from "@/lib/permissions/server";
import { getCurrentUser } from "@/server/music/auth";
import { readMixerSettings } from "@/server/music/models/mixer-settings";
import { MixerSetupForm } from "./mixer-setup-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.mixer.page.title };
}

export default async function MixerPage() {
  const { m } = await getI18n();

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={m.mixer.page.title} />

      {/* Reads the session cookie, so it renders at request time. */}
      <Suspense
        fallback={
          <FormSkeleton
            label={m.mixer.page.loading}
            fields={2}
            className="max-w-2xl px-4 py-6 sm:px-6"
          />
        }
      >
        <Setup />
      </Suspense>
    </div>
  );
}

// The gate only hides the page. The model functions check the roles again.
async function Setup() {
  const [user, { m }] = await Promise.all([getCurrentUser(), getI18n()]);

  if (!user || !(await canServer("music.mixer.setup", { tenantId: user.tenantId }))) {
    const gate = user ? m.mixer.gate.forbidden : m.mixer.gate.signIn;
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

  const { settings } = { settings: await readMixerSettings() };
  return (
    <div className="flex max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{m.mixer.page.intro}</p>
      <p className="text-sm text-muted">{m.mixer.page.howToSend}</p>
      <MixerSetupForm settings={settings} />
    </div>
  );
}

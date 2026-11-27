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
import { listDatabaseBooks } from "@/server/music/models/scripture-books";
import {
  getScriptureConfig,
  listOwnTranslations,
} from "@/server/music/models/scripture-translations";
import { TranslationsManager } from "./translations-manager";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.bibleTranslations.page.title };
}

// The Bible translations of the church (see `server/music/models/scripture-translations.ts`).
export default async function BibleTranslationsPage() {
  const { m } = await getI18n();
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={m.bibleTranslations.page.title} />
      {/* Reads the session cookie, so it renders at request time. */}
      <Suspense
        fallback={
          <p className="px-4 py-6 text-sm text-muted sm:px-6">
            {m.bibleTranslations.page.checkingAccess}
          </p>
        }
      >
        <Translations />
      </Suspense>
    </div>
  );
}

// The gate only hides the page. The actions go through `withPolicy` and RLS keeps the church.
async function Translations() {
  const [user, { m }] = await Promise.all([getCurrentUser(), getI18n()]);
  if (!user || !user.canEditEvents) {
    const gate = user ? m.bibleTranslations.gate.forbidden : m.bibleTranslations.gate.signIn;
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
  const [config, own] = await Promise.all([getScriptureConfig(), listOwnTranslations()]);
  const booksByTranslation = Object.fromEntries(
    await Promise.all(
      own
        .filter((translation) => translation.source === "database")
        .map(async ({ id }) => [id, await listDatabaseBooks(id)] as const),
    ),
  );
  return (
    <TranslationsManager
      karoli={config.karoli}
      translations={own}
      booksByTranslation={booksByTranslation}
    />
  );
}

"use client";

import { PageHeader } from "@/components/music/page-header";
import { useI18n } from "@/i18n/music/client";

/** The page header, for the page and its loading states. */
export function RehearsalHeader({ actions }: { actions?: React.ReactNode }) {
  const { m } = useI18n();

  return <PageHeader title={m.rehearsal.page.title} actions={actions} />;
}

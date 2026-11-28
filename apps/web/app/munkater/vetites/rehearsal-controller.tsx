"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ListMusicIcon, TriangleAlertIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/music/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/music/ui/empty";
import { useI18n } from "@/i18n/music/client";
import type { ProjectionSource } from "@/lib/music/projection/slides";
import type { ProjectionLook, ProjectionThemeChoice } from "@/lib/music/projection/themes";
import { parseDraft, readDraftSnapshot, subscribeToDraft, writeDraft } from "../proba/draft";
import { defaultProjectionLookAction, rehearsalSongsAction } from "./actions-client";
import { ProjectionController, type ReorderOutcome } from "./controller";

type Loaded = {
  snapshot: string;
  songs: Map<string, Omit<Extract<ProjectionSource, { kind: "song" }>, "kind" | "key">>;
};

/**
 * The controller of the rehearsal setlist in this browser (the draft of the
 * rehearsal page). It loads the songs once, so it works without a network
 * after that. A change of the draft, e.g. in another tab, shows a notice.
 * A drag on the controller reorders the draft.
 */
export function RehearsalProjectionController() {
  const { m } = useI18n();
  const t = m.project.gate;
  // Null on the server: the draft is in this browser only.
  const snapshot = useSyncExternalStore(subscribeToDraft, readDraftSnapshot, () => null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The look of the default projection theme. It loads once, so the controller works without a network after that.
  const [look, setLook] = useState<ProjectionLook | null>(null);
  useEffect(() => {
    let active = true;
    // A failure leaves the look from before the themes.
    void defaultProjectionLookAction().then(
      (result) => active && setLook(result),
      () => {},
    );
    return () => {
      active = false;
    };
  }, []);
  const themes = useMemo(
    (): ProjectionThemeChoice => ({
      themes: look ? [{ id: "default", name: "", isDefault: true, look }] : [],
      eventThemeId: null,
      itemThemeIds: {},
    }),
    [look],
  );

  // The draft when the controller opens. Later changes only show the notice.
  const [opened, setOpened] = useState<string | null>(null);
  if (opened === null && snapshot !== null) setOpened(snapshot);

  useEffect(() => {
    if (opened === null) return;
    const arrangementIds = parseDraft(opened).flatMap((row) =>
      row.kind === "song" ? [row.arrangementId] : [],
    );
    let active = true;
    rehearsalSongsAction(arrangementIds).then(
      (result) => {
        if (!active) return;
        if (result.status === "error") setError(result.message);
        else
          setLoaded({
            snapshot: opened,
            songs: new Map(result.songs.map(({ arrangementId, ...song }) => [arrangementId, song])),
          });
      },
      () => active && setError(t.loadFailed),
    );
    return () => {
      active = false;
    };
  }, [opened, attempt, t.loadFailed]);

  const sources = useMemo(
    () =>
      loaded
        ? parseDraft(loaded.snapshot).flatMap((row): ProjectionSource[] => {
            if (row.kind === "text") {
              return [
                {
                  kind: "text",
                  key: row.key,
                  title: row.title,
                  scripture: row.scripture,
                  translation: row.scriptureTranslation,
                },
              ];
            }
            const song = loaded.songs.get(row.arrangementId);
            return song ? [{ kind: "song", key: row.key, ...song }] : [];
          })
        : [],
    [loaded],
  );

  if (error) {
    return (
      <main className="flex h-dvh flex-col">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t.loadFailedTitle}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                setAttempt((count) => count + 1);
              }}
            >
              {t.retry}
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted">{m.project.page.loading}</p>
      </main>
    );
  }

  if (sources.length === 0) {
    return (
      <main className="flex h-dvh flex-col">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListMusicIcon />
            </EmptyMedia>
            <EmptyTitle>{t.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.emptyRehearsalDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/rehearsal" className={buttonVariants({ variant: "outline" })}>
              {t.goToRehearsal}
            </Link>
          </EmptyContent>
        </Empty>
      </main>
    );
  }

  return (
    <ProjectionController
      title={m.project.page.rehearsalTitle}
      backHref="/rehearsal"
      sources={sources}
      channel={{ eventId: null, connection: null }}
      liveSession={null}
      changed={snapshot !== null && snapshot !== loaded.snapshot}
      reorder={reorder}
      themes={themes}
      changeTheme={null}
    />
  );

  async function reorder(keys: string[]): Promise<ReorderOutcome> {
    if (!loaded) return { status: "error", message: m.project.controller.reorderFailed };
    // Not over a change from another tab.
    if (snapshot !== loaded.snapshot)
      return { status: "error", message: m.project.controller.reorderChanged };
    const rows = parseDraft(loaded.snapshot);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    // The rows of songs that did not load stay, at the end.
    const next = [
      ...keys.flatMap((key) => byKey.get(key) ?? []),
      ...rows.filter((row) => !keys.includes(row.key)),
    ];
    return {
      status: "success",
      apply: () => {
        writeDraft(next);
        setLoaded({ ...loaded, snapshot: JSON.stringify(next) });
      },
    };
  }
}

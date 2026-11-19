"use client";

import { IMPORT_STAGES, type ImportStage } from "@churchy/contracts";
import { cn } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { ImportProgress as Progress } from "@/lib/setup/progress";

/**
 * The stages of the running import as a list plus a live region (`role="status"`) that announces
 * the stage in progress, so the animation's information reaches screen-reader users too.
 */
export function ImportProgress({ progress }: { progress: Progress }) {
  const t = useT("admin.setup.progress");
  const stageText = (stage: ImportStage, state: "running" | "done") =>
    t(`stages.${stage}.${state}`, { count: progress.counts[stage] ?? 0 });
  const done = progress.completed.length;
  const current = progress.running;
  const last = progress.completed.at(-1);

  return (
    <div className="grid gap-4" data-testid="import-progress">
      <p
        role="status"
        aria-live="polite"
        className="text-fs-4 font-semibold"
        data-testid="progress-live"
      >
        {done === IMPORT_STAGES.length
          ? t("allDone")
          : current !== null
            ? stageText(current, "running")
            : last
              ? stageText(last, "done")
              : t("starting")}
      </p>
      <progress
        className="h-3 w-full accent-primary"
        max={IMPORT_STAGES.length}
        value={done}
        aria-label={t("bar")}
      />
      <ol className="grid gap-2" aria-label={t("list")}>
        {IMPORT_STAGES.map((stage) => {
          const isDone = progress.completed.includes(stage);
          const isRunning = current === stage;
          return (
            <li
              key={stage}
              data-stage={stage}
              data-state={isDone ? "done" : isRunning ? "running" : "waiting"}
              className={cn(
                "flex items-start gap-3 text-fs-3",
                isDone ? "text-text" : isRunning ? "font-semibold text-text" : "text-muted",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 inline-grid size-5 shrink-0 place-items-center rounded-full border-2 text-fs-1 font-bold",
                  isDone
                    ? "border-success bg-success text-surface-raised"
                    : isRunning
                      ? "border-primary"
                      : "border-border-strong",
                )}
              >
                {isDone ? "✓" : isRunning ? "…" : ""}
              </span>
              <span>
                {isDone ? stageText(stage, "done") : t(`stages.${stage}.label`)}
                <span className="sr-only">
                  {" — "}
                  {t(isDone ? "state.done" : isRunning ? "state.running" : "state.waiting")}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

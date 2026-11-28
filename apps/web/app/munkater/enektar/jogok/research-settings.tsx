"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { DownloadIcon, InfoIcon, PlayIcon, RotateCcwIcon, UploadIcon } from "lucide-react";

import { Field } from "@/components/music/form-field";
import { FormFooter, FormSection, submitWithoutReset } from "@/components/music/form-parts";
import { LocalDateTime } from "@/components/music/local-date-time";
import { Button } from "@/components/music/ui/button";
import { Card } from "@/components/music/ui/card";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import {
  RESEARCH_NIGHTLY_LIMIT_MAX,
  RESEARCH_NIGHTLY_LIMIT_MIN,
  DEFAULT_RESEARCH_RUN_NOW_COUNT,
  RESEARCH_FINDINGS_MAX,
  RESEARCH_FINDINGS_MAX_BYTES,
  RESEARCH_RUN_NOW_MAX,
  RESEARCH_RUN_NOW_MIN,
} from "@/lib/music/song-rights-research";
import { toastError } from "@/lib/music/toast";
import type {
  ResearchQuotaDTO,
  ResearchSettingsDTO,
} from "@/server/music/models/song-rights-research";
import { usePolicyAction } from "@/lib/music/policy-form";
import {
  exportSongsAction,
  researchSongAction,
  runNowAction,
  saveSettingsAction,
  uploadFindingsAction,
  type SongRightsFormState,
} from "./actions";

const initialState: SongRightsFormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * Music Sheet DB's research settings page. Churchy: the AI research runs on the platform key
 * within the plan's monthly cap ("Research now", "Research again"; off in demo mode, with a
 * notice), plus the upload of a local research and the closed researches. Their provider, API key
 * and test forms and the nightly research are left out (the nightly job: phase 8).
 */
export function ResearchSettings({
  settings,
  demo,
  quota,
}: {
  settings: ResearchSettingsDTO;
  demo: boolean;
  quota: ResearchQuotaDTO;
}) {
  const { m } = useI18n();
  const ai = quota.available && quota.limit > 0;

  return (
    <FormSection
      title={m.songRights.settings.title}
      description={m.songRights.settings.description}
    >
      {ai ? (
        <>
          <NightlyCard settings={settings} />
          <RunNowCard settings={settings} quota={quota} />
        </>
      ) : (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border bg-surface-sunken p-3 text-sm"
          data-testid="ai-research-off"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {demo
            ? m.songRights.aiOff.demo
            : quota.available
              ? m.songRights.quota.none
              : m.songRights.aiOff.notReady}
        </p>
      )}
      <UploadCard settings={settings} />
      <ClosedList settings={settings} again={ai && quota.used < quota.limit} />
    </FormSection>
  );
}

function UploadCard({ settings }: { settings: ResearchSettingsDTO }) {
  const { m, format } = useI18n();
  const t = m.songRights.upload;
  // The form resets after an upload: the next file starts from an empty field.
  const [state, formAction, uploading] = useActionState(
    usePolicyAction(uploadFindingsAction),
    initialState,
  );
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const denied = await exportSongsAction();
      const result = denied.ok
        ? denied.value
        : { status: "error" as const, message: m.common.errors.forbidden };
      if (result.status === "error") {
        toastError(result.message);
        return;
      }
      const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `song-rights-songs-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      // Some browsers, e.g. Safari, start the download after the click: the file must stay until then.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="gap-4">
      <div className="flex flex-col gap-1 text-sm">
        <h3 className="flex items-center gap-2 font-medium">
          <UploadIcon className="size-4" aria-hidden />
          {t.title}
        </h3>
        <p className="text-muted">{t.description}</p>
      </div>
      <div className="flex flex-col gap-2 text-sm">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={settings.openSongs === 0 || downloading}
          onClick={() => void download()}
        >
          <DownloadIcon />
          {downloading ? t.downloading : t.download}
        </Button>
        <p className="text-muted">{settings.openSongs === 0 ? t.downloadEmpty : t.downloadHint}</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <Field
          name="research-findings"
          label={t.file}
          hint={format(t.fileHint, {
            max: RESEARCH_FINDINGS_MAX,
            size: RESEARCH_FINDINGS_MAX_BYTES / 1024 / 1024,
          })}
          errors={state.fieldErrors.findings}
        >
          <Input
            id="research-findings"
            name="findings"
            type="file"
            accept=".json,application/json"
            required
            aria-describedby="research-findings-description"
          />
        </Field>
        <FormFooter state={state}>
          <Button type="submit" disabled={uploading}>
            <UploadIcon />
            {uploading ? t.uploading : t.upload}
          </Button>
        </FormFooter>
      </form>
    </Card>
  );
}

function ClosedList({ settings, again }: { settings: ResearchSettingsDTO; again: boolean }) {
  const { m } = useI18n();
  const t = m.songRights.closed;

  return (
    <Card className="gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <h3 className="font-medium">{t.title}</h3>
        <p className="text-muted">{t.description}</p>
      </div>
      {settings.recentClosed.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {settings.recentClosed.map((row) => (
            <ClosedRow key={`${row.songId}-${row.createdAt}`} row={row} again={again} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClosedRow({
  row,
  again,
}: {
  row: ResearchSettingsDTO["recentClosed"][number];
  again: boolean;
}) {
  const { m } = useI18n();
  const t = m.songRights.closed;
  const [state, formAction, pending] = useActionState(
    usePolicyAction(researchSongAction),
    initialState,
  );

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/munkater/enektar?song=${row.songId}`}
          className="font-medium break-words hover:underline"
        >
          {row.title}
        </Link>
        <span className="text-xs text-muted">
          {row.status === "rejected" ? t.rejected : t.failed} ·{" "}
          <LocalDateTime
            date={row.createdAt}
            options={{ dateStyle: "medium", timeStyle: "short" }}
          />
        </span>
        {row.error && <span className="text-xs break-words text-danger">{row.error}</span>}
      </div>
      {again && (
        <form action={formAction}>
          <input type="hidden" name="id" value={row.songId} />
          <input type="hidden" name="title" value={row.title} />
          {state.status === "error" && state.message && (
            <span role="alert" className="text-xs text-danger">
              {state.message}
            </span>
          )}
          <FormFooter state={state.status === "success" ? state : initialState}>
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              <RotateCcwIcon />
              {pending ? t.researching : t.again}
            </Button>
          </FormFooter>
        </form>
      )}
    </li>
  );
}

/** "Research now" (their `RunNowCard`) with the month's quota of the plan. */
function RunNowCard({
  settings,
  quota,
}: {
  settings: ResearchSettingsDTO;
  quota: ResearchQuotaDTO;
}) {
  const { m, format } = useI18n();
  const t = m.songRights.runNow;
  const [state, formAction, running] = useActionState(usePolicyAction(runNowAction), initialState);
  const left = Math.max(0, quota.limit - quota.used);
  const max = Math.min(RESEARCH_RUN_NOW_MAX, left);

  return (
    <Card className="gap-4" data-testid="ai-research">
      <div className="flex flex-col gap-1 text-sm">
        <h3 className="flex items-center gap-2 font-medium">
          <PlayIcon className="size-4" aria-hidden />
          {t.title}
        </h3>
        <p className="text-muted">{t.description}</p>
        <p>{format(m.songRights.quota.line, { used: quota.used, limit: quota.limit })}</p>
      </div>
      {left === 0 ? (
        <p className="text-sm text-muted">
          {format(m.songRights.quota.reached, { limit: quota.limit })}
        </p>
      ) : settings.openSongs === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        // The number stays in the field after a run.
        <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
          <Field
            name="research-now-count"
            label={t.count}
            hint={format(t.countHint, { max })}
            errors={state.fieldErrors.count}
          >
            <Input
              id="research-now-count"
              name="count"
              type="number"
              inputMode="numeric"
              required
              min={RESEARCH_RUN_NOW_MIN}
              max={max}
              defaultValue={Math.min(DEFAULT_RESEARCH_RUN_NOW_COUNT, settings.openSongs, max)}
              className="w-28"
              aria-describedby="research-now-count-description"
              aria-invalid={(state.fieldErrors.count?.length ?? 0) > 0 || undefined}
            />
          </Field>
          <FormFooter state={state}>
            <Button type="submit" disabled={running}>
              <PlayIcon />
              {running ? t.running : t.start}
            </Button>
          </FormFooter>
        </form>
      )}
    </Card>
  );
}

/** The nightly research: on or off, and the songs per night. The job needs the platform key and the plan's cap. */
function NightlyCard({ settings }: { settings: ResearchSettingsDTO }) {
  const { m, format } = useI18n();
  const t = m.songRights.settings;
  const [state, formAction, saving] = useActionState(
    usePolicyAction(saveSettingsAction),
    initialState,
  );
  return (
    <Card className="gap-4" data-testid="ai-nightly">
      <form onSubmit={submitWithoutReset(formAction)} className="flex flex-col gap-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
            aria-describedby="nightly-enabled-hint"
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{t.enabled}</span>
            <span id="nightly-enabled-hint" className="text-muted">
              {t.enabledHint}
            </span>
          </span>
        </label>
        <Field
          name="nightly-limit"
          label={t.nightlyLimit}
          hint={format(t.nightlyLimitHint, { max: RESEARCH_NIGHTLY_LIMIT_MAX })}
          errors={state.fieldErrors.nightlyLimit}
        >
          <Input
            id="nightly-limit"
            name="nightlyLimit"
            type="number"
            inputMode="numeric"
            required
            min={RESEARCH_NIGHTLY_LIMIT_MIN}
            max={RESEARCH_NIGHTLY_LIMIT_MAX}
            defaultValue={settings.nightlyLimit}
            className="w-28"
            aria-describedby="nightly-limit-description"
          />
        </Field>
        <FormFooter state={state}>
          <Button type="submit" disabled={saving}>
            {saving ? t.saving : t.save}
          </Button>
        </FormFooter>
      </form>
    </Card>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { DownloadIcon, InfoIcon, UploadIcon } from "lucide-react";

import { Field } from "@/components/music/form-field";
import { FormFooter, FormSection } from "@/components/music/form-parts";
import { LocalDateTime } from "@/components/music/local-date-time";
import { Button } from "@/components/music/ui/button";
import { Card } from "@/components/music/ui/card";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import {
  RESEARCH_FINDINGS_MAX,
  RESEARCH_FINDINGS_MAX_BYTES,
} from "@/lib/music/song-rights-research";
import { toastError } from "@/lib/music/toast";
import type { ResearchSettingsDTO } from "@/server/music/models/song-rights-research";
import { usePolicyAction } from "@/lib/music/policy-form";
import { exportSongsAction, uploadFindingsAction, type SongRightsFormState } from "./actions";

const initialState: SongRightsFormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * Music Sheet DB's research settings page. Churchy (music phase 2): the upload of a local
 * research and the closed researches. The AI research (provider, API key, test, "Research now",
 * "Research again") waits for the platform key and the per-plan cap; a notice says so.
 */
export function ResearchSettings({
  settings,
  demo,
}: {
  settings: ResearchSettingsDTO;
  demo: boolean;
}) {
  const { m } = useI18n();

  return (
    <FormSection
      title={m.songRights.settings.title}
      description={m.songRights.settings.description}
    >
      <p
        role="note"
        className="flex items-start gap-2 rounded-lg border bg-surface-sunken p-3 text-sm"
        data-testid="ai-research-off"
      >
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {demo ? m.songRights.aiOff.demo : m.songRights.aiOff.notReady}
      </p>
      <UploadCard settings={settings} />
      <ClosedList settings={settings} />
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

function ClosedList({ settings }: { settings: ResearchSettingsDTO }) {
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
            <ClosedRow key={`${row.songId}-${row.createdAt}`} row={row} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ClosedRow({ row }: { row: ResearchSettingsDTO["recentClosed"][number] }) {
  const { m } = useI18n();
  const t = m.songRights.closed;

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
    </li>
  );
}

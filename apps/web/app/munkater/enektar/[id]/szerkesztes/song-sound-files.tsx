"use client";

import { useActionState, useRef, useState } from "react";
import { AudioLinesIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { useAttachmentDetails } from "@/components/music/attachment-details";
import { AttachmentFields } from "@/components/music/attachment-fields";
import { DROP_SELECTED, setInputFile, useFileDropTarget } from "@/components/music/file-drop";
import { Field } from "@/components/music/form-field";
import { ConfirmDialog, ConfirmDialogTrigger, FormSection } from "@/components/music/form-parts";
import { KeptPanel, SaveStatus, useKeptPanel } from "@/components/music/page-save";
import { invalidating } from "@/components/music/page-cache";
import { PreviewLayout } from "@/components/music/preview-layout";
import { SoundFilePlayer } from "@/components/music/song-media";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { changedPages } from "@/lib/music/page-keys";
import { SOUND_FILE_ACCEPT, SOUND_FILE_FORMAT_NAMES, uploadTypeOf } from "@/lib/music/sound-files";
import { cn } from "@/lib/music/utils";
import type { FormState } from "@/server/music/form-state";
import type { SongSoundFileDTO } from "@/server/music/models/sound-files";
import {
  addSoundFileAction,
  removeSoundFileAction,
  startSoundFileUploadAction,
  updateSoundFileAction,
} from "./file-actions-client";
import { useAttachmentForm } from "./use-attachment-form";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

type Arrangement = { id: string; name: string };

type Limits = {
  /** The largest file, in bytes. */
  maxBytes: number;
  /** The most sound files of a song. */
  maxSoundFiles: number;
  nameMaxLength: number;
};

/**
 * The sound files of a song: add, play, edit (name, arrangements and keys)
 * and remove them. Only for song admins and superadmins.
 */
export function SongSoundFiles({
  songId,
  soundFiles,
  arrangements,
  limits,
}: {
  songId: string;
  soundFiles: SongSoundFileDTO[];
  /** The arrangements of the song, that a sound file can be for. */
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.soundFiles;
  // One sound file at a time shows its edit form.
  const [editing, setEditing] = useState<string | null>(null);
  const full = soundFiles.length >= limits.maxSoundFiles;

  return (
    <PreviewLayout>
      <FormSection title={t.title} description={t.description}>
        {soundFiles.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-card border border-dashed px-4 py-6 text-center">
            <AudioLinesIcon aria-hidden className="mb-1 size-5 text-muted" />
            <p className="text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-sm text-muted">{t.emptyDescription}</p>
          </div>
        ) : (
          <ul aria-label={t.list} className="flex flex-col divide-y rounded-card border">
            {soundFiles.map((soundFile) => (
              <SoundFileRow
                key={soundFile.id}
                soundFile={soundFile}
                arrangements={arrangements}
                limits={limits}
                editing={editing === soundFile.id}
                onEdit={(edit) => setEditing(edit ? soundFile.id : null)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">{t.add}</h3>
          {full ? (
            <p className="text-sm text-muted">
              {format(t.limitReached, { max: limits.maxSoundFiles })}
            </p>
          ) : (
            <AddSoundFileForm songId={songId} arrangements={arrangements} limits={limits} />
          )}
        </section>
      </FormSection>
    </PreviewLayout>
  );
}

function SoundFileRow({
  soundFile,
  arrangements,
  limits,
  editing,
  onEdit,
}: {
  soundFile: SongSoundFileDTO;
  arrangements: Arrangement[];
  limits: Limits;
  editing: boolean;
  onEdit: (editing: boolean) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.soundFiles;
  const details = useAttachmentDetails();
  const panel = useKeptPanel(editing);

  return (
    <li className="flex flex-col gap-3 px-3 py-2">
      <SoundFilePlayer
        file={soundFile}
        details={`${soundFile.fileName}${m.common.separator}${details(soundFile, arrangements)}`}
      />
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          title={format(t.editTitle, { name: soundFile.name })}
          aria-expanded={editing}
          onClick={() => onEdit(!editing)}
        >
          <PencilIcon />
          {t.edit}
        </Button>
        <RemoveSoundFileButton soundFile={soundFile} />
      </div>
      <KeptPanel panel={panel} open={editing} onOpen={() => onEdit(true)}>
        <EditSoundFileForm
          soundFile={soundFile}
          arrangements={arrangements}
          limits={limits}
          onSaved={() => onEdit(false)}
          onCancel={() => {
            panel.discard();
            onEdit(false);
          }}
        />
      </KeptPanel>
    </li>
  );
}

function AddSoundFileForm({
  songId,
  arrangements,
  limits,
}: {
  songId: string;
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.soundFiles;
  const mb = limits.maxBytes / (1024 * 1024);
  const tooLarge = format(t.fileTooLarge, { mb });

  /**
   * Puts the file directly to Storage (a Vercel Function accepts at most
   * 4.5 MB), then adds it. The server checks the stored file again.
   */
  async function uploadSoundFile(formData: FormData): Promise<FormState> {
    const file = formData.get("soundFile");
    if (!(file instanceof File) || file.size === 0)
      return fileError(m.server.soundFiles.chooseFile);
    // Storage refuses a larger file too. This says why at once.
    if (file.size > limits.maxBytes) return fileError(tooLarge);
    // Storage takes only the types of the bucket.
    const type = uploadTypeOf(file);
    if (!type) return fileError(t.fileType);
    // An MP4 or WebM file can also be a video. Its first bytes do not say it.
    if (await hasVideo(file)) return fileError(t.fileVideo);

    const upload = await startSoundFileUploadAction(songId);
    if (!("uploadUrl" in upload)) return upload;

    let response: Response;
    try {
      response = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "content-type": type, "cache-control": "max-age=31536000", "x-upsert": "false" },
        body: file,
      });
    } catch {
      return { status: "error", message: t.uploadFailed, fieldErrors: {} };
    }
    if (!response.ok) {
      // Storage can also give the HTTP status in the body, e.g. `{ "statusCode": "413" }`.
      const body: unknown = await response.json().catch(() => null);
      const status =
        body && typeof body === "object" && "statusCode" in body ? String(body.statusCode) : "";
      if (response.status === 413 || status === "413") return fileError(tooLarge);
      if (response.status === 415 || status === "415") return fileError(t.fileType);
      return { status: "error", message: t.uploadFailed, fieldErrors: {} };
    }

    formData.delete("soundFile");
    formData.set("songId", songId);
    formData.set("path", upload.path);
    formData.set("fileName", file.name);
    return addSoundFileAction(initialState, formData);
  }

  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(formRef, uploadSoundFile, {
    connectionFailed: t.connectionFailed,
    onSuccess: (form) => form.reset(),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = useFileDropTarget(
    pending
      ? null
      : {
          id: "sound-files",
          label: t.add,
          kinds: ["sound"],
          element: formRef,
          onFiles: (files) => setInputFile(fileRef.current, files[0]!),
        },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        name="sound-file"
        label={t.file}
        hint={format(t.fileHint, { mb, formats: SOUND_FILE_FORMAT_NAMES })}
        errors={state.fieldErrors.soundFile}
      >
        <Input
          ref={fileRef}
          id="sound-file"
          name="soundFile"
          type="file"
          accept={SOUND_FILE_ACCEPT}
          required
          aria-invalid={(state.fieldErrors.soundFile?.length ?? 0) > 0 || undefined}
          aria-describedby="sound-file-description"
          className={cn(drop.selected && DROP_SELECTED)}
        />
      </Field>
      <SoundFileFields id="sound-file" arrangements={arrangements} limits={limits} state={state} />
      <SaveStatus state={state} pending={pending} pendingLabel={t.pending} />
    </form>
  );
}

function EditSoundFileForm({
  soundFile,
  arrangements,
  limits,
  onSaved,
  onCancel,
}: {
  soundFile: SongSoundFileDTO;
  arrangements: Arrangement[];
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes and closes the form. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.soundFiles;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(
    formRef,
    (formData) => updateSoundFileAction(initialState, formData),
    { connectionFailed: t.connectionFailed, onSuccess: onSaved },
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-card bg-surface-sunken/50 p-3"
    >
      <input type="hidden" name="id" value={soundFile.id} />
      <SoundFileFields
        id={`edit-${soundFile.id}`}
        soundFile={soundFile}
        arrangements={arrangements}
        limits={limits}
        state={state}
      />
      <SaveStatus state={state} pending={pending} pendingLabel={t.editPending} />
      <div>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {m.common.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The name, the arrangements and the keys of a sound file. `soundFile` gives the values to edit. */
function SoundFileFields({
  id,
  soundFile,
  arrangements,
  limits,
  state,
}: {
  id: string;
  soundFile?: SongSoundFileDTO;
  arrangements: Arrangement[];
  limits: Limits;
  state: FormState;
}) {
  const { m } = useI18n();
  return (
    <AttachmentFields
      id={id}
      values={soundFile}
      arrangements={arrangements}
      nameMaxLength={limits.nameMaxLength}
      errors={state.fieldErrors}
      texts={m.songs.soundFiles}
    />
  );
}

function RemoveSoundFileButton({ soundFile }: { soundFile: SongSoundFileDTO }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.songs(), removeSoundFileAction),
    initialState,
  );
  const [open, setOpen] = useState(false);
  const { m, format } = useI18n();
  const t = m.songs.soundFiles;

  // Close the dialog after the removal.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ConfirmDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={format(t.removeTitle, { name: soundFile.name })}
              className="text-danger hover:text-danger"
            />
          }
        >
          <Trash2Icon />
          {t.remove}
        </ConfirmDialogTrigger>
      }
      title={t.confirmTitle}
      description={rich(t.confirmDescription, {
        // The name goes in after the markup is read, so a name with "<…>" stays text.
        strong: (chunk) => (
          <strong className="text-text">{format(chunk, { name: soundFile.name })}</strong>
        ),
      })}
      id={soundFile.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.remove}
      pendingLabel={t.removePending}
    />
  );
}

function fileError(message: string): FormState {
  return { status: "error", message: null, fieldErrors: { soundFile: [message] } };
}

/**
 * True if the browser finds a picture in the file. False also when it cannot
 * read the file, e.g. a format that it does not play: then the file goes up.
 */
function hasVideo(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (result: boolean) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => done(false), 5000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(video.videoWidth > 0);
    video.onerror = () => done(false);
    video.src = url;
  });
}

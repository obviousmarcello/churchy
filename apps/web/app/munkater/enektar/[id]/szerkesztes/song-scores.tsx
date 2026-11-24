"use client";

import { useActionState, useRef, useState } from "react";
import { FileMusicIcon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { DROP_SELECTED, setInputFile, useFileDropTarget } from "@/components/music/file-drop";
import { Field } from "@/components/music/form-field";
import { ConfirmDialog, ConfirmDialogTrigger, FormSection } from "@/components/music/form-parts";
import { KeptPanel, SaveStatus, useKeptPanel } from "@/components/music/page-save";
import { useNoteNames } from "@/components/music/note-names";
import { invalidating } from "@/components/music/page-cache";
import {
  PreviewEmpty,
  PreviewLayout,
  PreviewSection,
  previewButtonClass,
} from "@/components/music/preview-layout";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { fromEnglish } from "@/lib/music/chords/notation";
import { changedPages } from "@/lib/music/page-keys";
import { MAJOR_SCORE_KEYS, MINOR_SCORE_KEYS } from "@/lib/music/score/score-key";
import { cn } from "@/lib/music/utils";
import type { FormState } from "@/server/music/form-state";
import type { SongScoreDTO } from "@/server/music/models/scores";
import {
  addScoreAction,
  removeScoreAction,
  replaceScoreAction,
  updateScoreAction,
} from "./file-actions-client";
import { ScoreView } from "../../../kotta/score-view";
import { useSheetSettings } from "../../../kotta/sheet-settings";
import { useAttachmentForm } from "./use-attachment-form";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

// MuseScore exports `.mxl` (compressed) and `.musicxml`; older programs write `.xml`.
const ACCEPTED_FILES =
  ".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml";

type Limits = {
  /** The largest file, in bytes. */
  maxBytes: number;
  /** The most scores of a song. */
  maxScores: number;
  nameMaxLength: number;
};

/**
 * The MusicXML scores of a song: add, edit (name and key), replace and remove
 * them. Only for song admins and superadmins.
 */
export function SongScores({
  songId,
  scores,
  limits,
}: {
  songId: string;
  scores: SongScoreDTO[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.scores;
  // One score at a time shows its edit or replace form.
  const [editing, setEditing] = useState<{ id: string; mode: "edit" | "replace" } | null>(null);
  // The score in the preview: the first one, until the user chooses one.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewed = scores.find((score) => score.id === previewId) ?? scores[0] ?? null;
  const full = scores.length >= limits.maxScores;

  return (
    <PreviewLayout lazy preview={<ScorePreview score={previewed} />}>
      <FormSection title={t.title} description={t.description}>
        {scores.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center">
            <FileMusicIcon aria-hidden className="mb-1 size-5 text-muted" />
            <p className="text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-sm text-muted">{t.emptyDescription}</p>
          </div>
        ) : (
          <ul aria-label={t.list} className="flex flex-col divide-y rounded-lg border">
            {scores.map((score) => (
              <ScoreRow
                key={score.id}
                score={score}
                limits={limits}
                editing={editing?.id === score.id ? editing.mode : null}
                onEdit={(mode) => setEditing(mode ? { id: score.id, mode } : null)}
                previewed={score.id === previewed?.id}
                onPreview={() => setPreviewId(score.id)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">{t.add}</h3>
          {full ? (
            <p className="text-sm text-muted">
              {format(t.limitReached, { max: limits.maxScores })}
            </p>
          ) : (
            <AddScoreForm songId={songId} limits={limits} />
          )}
        </section>
      </FormSection>
    </PreviewLayout>
  );
}

const nothing = () => {};

/** No notes sound: the same array each time, so the score does not light up again. */
const NO_NOTES: string[] = [];

/** The score as the sheet shows it, in its own key, on the paper of the user's sheet settings. */
function ScorePreview({ score }: { score: SongScoreDTO | null }) {
  const { m } = useI18n();
  const t = m.songs.scores;
  const settings = useSheetSettings();

  return (
    <PreviewSection title={m.songs.form.preview} hint={score?.name}>
      {score ? (
        <div
          // The colors of the paper are in `globals.css`, for the light and the dark theme.
          data-sheet-paper={settings.background}
          className="overflow-hidden rounded-lg border bg-(--sheet-bg) text-(--sheet-fg)"
        >
          {/* As on the sheet, the score fits its pages to the group and the article. */}
          <div data-sheet-group className="h-[calc(100dvh-12rem)] overflow-y-auto p-4 text-sm">
            <article>
              <ScoreView
                key={score.url}
                url={score.url}
                transpose={null}
                showChords
                sizePercent={80}
                active={NO_NOTES}
                onLayout={nothing}
                onTimeline={nothing}
                onReveal={nothing}
              />
            </article>
          </div>
        </div>
      ) : (
        <PreviewEmpty
          icon={<FileMusicIcon aria-hidden />}
          title={t.previewEmptyTitle}
          description={t.previewEmptyDescription}
        />
      )}
    </PreviewSection>
  );
}

function ScoreRow({
  score,
  limits,
  editing,
  onEdit,
  previewed,
  onPreview,
}: {
  score: SongScoreDTO;
  limits: Limits;
  editing: "edit" | "replace" | null;
  onEdit: (mode: "edit" | "replace" | null) => void;
  /** The preview shows this score. */
  previewed: boolean;
  onPreview: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.scores;
  const noteNames = useNoteNames();
  const key = score.key ? format(t.key, { key: fromEnglish(score.key, noteNames) }) : t.noKey;
  const editPanel = useKeptPanel(editing === "edit");
  const replacePanel = useKeptPanel(editing === "replace");

  return (
    <li className={cn("flex flex-col gap-3 px-3 py-2", previewed && "bg-surface-sunken/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={previewed}
          title={format(t.show, { name: score.name })}
          onClick={onPreview}
          className={cn(previewButtonClass, "basis-48 flex-col gap-0.5")}
        >
          <span className="truncate text-sm font-medium">{score.name}</span>
          <span className="truncate text-sm text-muted">
            {score.fileName}
            {m.common.separator}
            {key}
          </span>
        </button>
        {/* The name keeps some room: the buttons go under it, and wrap, on a narrow screen. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={format(t.editTitle, { name: score.name })}
            aria-expanded={editing === "edit"}
            onClick={() => onEdit(editing === "edit" ? null : "edit")}
          >
            <PencilIcon />
            {t.edit}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={format(t.replaceTitle, { name: score.name })}
            aria-expanded={editing === "replace"}
            onClick={() => onEdit(editing === "replace" ? null : "replace")}
          >
            <UploadIcon />
            {t.replace}
          </Button>
          <RemoveScoreButton score={score} />
        </div>
      </div>
      <KeptPanel panel={editPanel} open={editing === "edit"} onOpen={() => onEdit("edit")}>
        <EditScoreForm
          score={score}
          limits={limits}
          onSaved={() => onEdit(null)}
          onCancel={() => {
            editPanel.discard();
            onEdit(null);
          }}
        />
      </KeptPanel>
      <KeptPanel panel={replacePanel} open={editing === "replace"} onOpen={() => onEdit("replace")}>
        <ReplaceScoreForm
          score={score}
          limits={limits}
          onSaved={() => onEdit(null)}
          onCancel={() => {
            replacePanel.discard();
            onEdit(null);
          }}
        />
      </KeptPanel>
    </li>
  );
}

function AddScoreForm({ songId, limits }: { songId: string; limits: Limits }) {
  const { m, format } = useI18n();
  const t = m.songs.scores;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useScoreForm(formRef, addScoreAction, limits.maxBytes);
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = useFileDropTarget(
    pending
      ? null
      : {
          id: "scores",
          label: t.add,
          kinds: ["score"],
          element: formRef,
          onFiles: (files) => setInputFile(fileRef.current, files[0]!),
        },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="songId" value={songId} />
      <Field name="score-name" label={t.name} hint={t.nameHint} errors={state.fieldErrors.name}>
        <Input
          id="score-name"
          name="name"
          maxLength={limits.nameMaxLength}
          aria-invalid={(state.fieldErrors.name?.length ?? 0) > 0 || undefined}
          aria-describedby="score-name-description"
        />
      </Field>
      <Field
        name="score-file"
        label={t.file}
        hint={format(t.fileHint, { mb: limits.maxBytes / (1024 * 1024) })}
        errors={state.fieldErrors.score}
      >
        <Input
          ref={fileRef}
          id="score-file"
          name="score"
          type="file"
          accept={ACCEPTED_FILES}
          required
          aria-invalid={(state.fieldErrors.score?.length ?? 0) > 0 || undefined}
          aria-describedby="score-file-description"
          className={cn(drop.selected && DROP_SELECTED)}
        />
      </Field>
      <ScoreKeyField
        id="score-key"
        hint={t.keyHint}
        errors={state.fieldErrors.key}
        blankLabel={t.keyFromFile}
      />
      <SaveStatus state={state} pending={pending} pendingLabel={t.pending} />
    </form>
  );
}

function EditScoreForm({
  score,
  limits,
  onSaved,
  onCancel,
}: {
  score: SongScoreDTO;
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes and closes the form. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.scores;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useScoreForm(
    formRef,
    updateScoreAction,
    limits.maxBytes,
    onSaved,
  );
  const id = `edit-${score.id}`;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg bg-surface-sunken/50 p-3"
    >
      <input type="hidden" name="id" value={score.id} />
      <Field name={id} label={t.name} hint={t.nameHint} errors={state.fieldErrors.name}>
        <Input
          id={id}
          name="name"
          defaultValue={score.name}
          maxLength={limits.nameMaxLength}
          autoFocus
          aria-invalid={(state.fieldErrors.name?.length ?? 0) > 0 || undefined}
          aria-describedby={`${id}-description`}
        />
      </Field>
      <ScoreKeyField
        id={`${id}-key`}
        hint={t.keyHint}
        errors={state.fieldErrors.key}
        blankLabel={t.keyNone}
        defaultValue={score.key ?? ""}
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

function ReplaceScoreForm({
  score,
  limits,
  onSaved,
  onCancel,
}: {
  score: SongScoreDTO;
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes and closes the form. */
  onCancel: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.scores;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useScoreForm(
    formRef,
    replaceScoreAction,
    limits.maxBytes,
    onSaved,
  );
  const id = `replace-${score.id}`;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg bg-surface-sunken/50 p-3"
    >
      <input type="hidden" name="id" value={score.id} />
      <p className="text-sm text-muted">{t.replaceHint}</p>
      <Field
        name={id}
        label={t.file}
        hint={format(t.fileHint, { mb: limits.maxBytes / (1024 * 1024) })}
        errors={state.fieldErrors.score}
      >
        <Input
          id={id}
          name="score"
          type="file"
          accept={ACCEPTED_FILES}
          required
          aria-invalid={(state.fieldErrors.score?.length ?? 0) > 0 || undefined}
          aria-describedby={`${id}-description`}
        />
      </Field>
      <ScoreKeyField
        id={`${id}-key`}
        hint={t.replaceKeyHint}
        errors={state.fieldErrors.key}
        blankLabel={t.keyFromFile}
      />
      <SaveStatus state={state} pending={pending} pendingLabel={t.replacePending} />
      <div>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
          {m.common.actions.cancel}
        </Button>
      </div>
    </form>
  );
}

/**
 * The key that the score sounds in, in the user's note names. The sheet
 * moves the score from it. `blankLabel` names the empty choice: the key from
 * the file, or no key.
 */
function ScoreKeyField({
  id,
  hint,
  errors,
  blankLabel,
  defaultValue = "",
}: {
  id: string;
  hint: string;
  errors: string[] | undefined;
  blankLabel: string;
  defaultValue?: string;
}) {
  const { m } = useI18n();
  const t = m.songs.scores;
  const noteNames = useNoteNames();

  return (
    <Field name={id} label={t.keyLabel} hint={hint} errors={errors}>
      <NativeSelect
        id={id}
        name="key"
        defaultValue={defaultValue}
        aria-invalid={(errors?.length ?? 0) > 0 || undefined}
        aria-describedby={`${id}-description`}
      >
        <option value="">{blankLabel}</option>
        <optgroup label={t.majorKeys}>
          {MAJOR_SCORE_KEYS.map((key) => (
            <option key={key} value={key}>
              {fromEnglish(key, noteNames)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t.minorKeys}>
          {MINOR_SCORE_KEYS.map((key) => (
            <option key={key} value={key}>
              {fromEnglish(key, noteNames)}
            </option>
          ))}
        </optgroup>
      </NativeSelect>
    </Field>
  );
}

function RemoveScoreButton({ score }: { score: SongScoreDTO }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.songs(), removeScoreAction),
    initialState,
  );
  const [open, setOpen] = useState(false);
  const { m, format } = useI18n();
  const t = m.songs.scores;

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
              title={format(t.removeTitle, { name: score.name })}
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
          <strong className="text-text">{format(chunk, { name: score.name })}</strong>
        ),
      })}
      id={score.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.remove}
      pendingLabel={t.removePending}
    />
  );
}

/**
 * Sends a score form when the page saves (see `useAttachmentForm`). A file
 * larger than `maxBytes` shows its error before the page saves any form: the
 * server would refuse it before it can say why. After a success the form is empty again, and
 * `onSuccess` runs.
 */
function useScoreForm(
  formRef: React.RefObject<HTMLFormElement | null>,
  action: (state: FormState, formData: FormData) => Promise<FormState>,
  maxBytes: number,
  onSuccess?: () => void,
) {
  const { m, format } = useI18n();
  const t = m.songs.scores;
  return useAttachmentForm(formRef, (formData) => action(initialState, formData), {
    connectionFailed: t.connectionFailed,
    check: (formData) => {
      const file = formData.get("score");
      if (!(file instanceof Blob) || file.size <= maxBytes) return null;
      return {
        status: "error",
        message: null,
        fieldErrors: { score: [format(t.fileTooLarge, { mb: maxBytes / (1024 * 1024) })] },
      };
    },
    onSuccess: (form) => {
      form.reset();
      onSuccess?.();
    },
  });
}

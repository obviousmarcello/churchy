"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon, FileTextIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { useAttachmentDetails } from "@/components/music/attachment-details";
import { AttachmentFields } from "@/components/music/attachment-fields";
import { DROP_SELECTED, setInputFile, useFileDropTarget } from "@/components/music/file-drop";
import { Field } from "@/components/music/form-field";
import { ConfirmDialog, ConfirmDialogTrigger, FormSection } from "@/components/music/form-parts";
import { KeptPanel, SaveStatus, useKeptPanel } from "@/components/music/page-save";
import { invalidating } from "@/components/music/page-cache";
import { PdfPreview } from "@/components/music/pdf-viewer";
import {
  PreviewEmpty,
  PreviewLayout,
  PreviewPages,
  PreviewSection,
  previewButtonClass,
} from "@/components/music/preview-layout";
import { Button, buttonVariants } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { pdfHref } from "@/lib/music/next-path";
import { changedPages } from "@/lib/music/page-keys";
import { cn } from "@/lib/music/utils";
import type { FormState } from "@/server/music/form-state";
import type { SongPdfDTO } from "@/server/music/models/pdfs";
import {
  addPdfAction,
  removePdfAction,
  startPdfUploadAction,
  updatePdfAction,
} from "./file-actions-client";
import { useAttachmentForm } from "./use-attachment-form";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

type Arrangement = { id: string; name: string };

type Limits = {
  /** The largest file, in bytes. */
  maxBytes: number;
  /** The most PDF files of a song. */
  maxPdfs: number;
  nameMaxLength: number;
};

/**
 * The PDF files of a song: add, edit (name, arrangements and keys) and remove
 * them. Only for song admins and superadmins.
 */
export function SongPdfs({
  songId,
  pdfs,
  arrangements,
  limits,
}: {
  songId: string;
  pdfs: SongPdfDTO[];
  /** The arrangements of the song, that a PDF file can be for. */
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.pdfs;
  // One PDF file at a time shows its edit form.
  const [editing, setEditing] = useState<string | null>(null);
  // The PDF file in the preview: the first one, until the user chooses one.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewed = pdfs.find((pdf) => pdf.id === previewId) ?? pdfs[0] ?? null;
  const full = pdfs.length >= limits.maxPdfs;

  return (
    <PreviewLayout
      lazy
      preview={
        <PreviewSection title={m.songs.form.preview} hint={previewed?.name}>
          {previewed ? (
            <PreviewPages>
              <PdfPreview
                key={previewed.url}
                url={previewed.url}
                downloadUrl={`${previewed.url}?download=1`}
              />
            </PreviewPages>
          ) : (
            <PreviewEmpty
              icon={<FileTextIcon aria-hidden />}
              title={t.previewEmptyTitle}
              description={t.previewEmptyDescription}
            />
          )}
        </PreviewSection>
      }
    >
      <FormSection title={t.title} description={t.description}>
        {pdfs.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center">
            <FileTextIcon aria-hidden className="mb-1 size-5 text-muted" />
            <p className="text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-sm text-muted">{t.emptyDescription}</p>
          </div>
        ) : (
          <ul aria-label={t.list} className="flex flex-col divide-y rounded-lg border">
            {pdfs.map((pdf) => (
              <PdfRow
                key={pdf.id}
                songId={songId}
                pdf={pdf}
                arrangements={arrangements}
                limits={limits}
                editing={editing === pdf.id}
                onEdit={(edit) => setEditing(edit ? pdf.id : null)}
                previewed={pdf.id === previewed?.id}
                onPreview={() => setPreviewId(pdf.id)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">{t.add}</h3>
          {full ? (
            <p className="text-sm text-muted">{format(t.limitReached, { max: limits.maxPdfs })}</p>
          ) : (
            <AddPdfForm songId={songId} arrangements={arrangements} limits={limits} />
          )}
        </section>
      </FormSection>
    </PreviewLayout>
  );
}

function PdfRow({
  songId,
  pdf,
  arrangements,
  limits,
  editing,
  onEdit,
  previewed,
  onPreview,
}: {
  songId: string;
  pdf: SongPdfDTO;
  arrangements: Arrangement[];
  limits: Limits;
  editing: boolean;
  onEdit: (editing: boolean) => void;
  /** The preview shows this PDF file. */
  previewed: boolean;
  onPreview: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.pdfs;
  const details = useAttachmentDetails();
  const panel = useKeptPanel(editing);

  return (
    <li className={cn("flex flex-col gap-3 px-3 py-2", previewed && "bg-surface-sunken/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={previewed}
          title={format(t.show, { name: pdf.name })}
          onClick={onPreview}
          className={cn(previewButtonClass, "basis-48 flex-col gap-0.5")}
        >
          <span className="truncate text-sm font-medium">{pdf.name}</span>
          <span className="truncate text-sm text-muted">
            {pdf.fileName}
            {m.common.separator}
            {details(pdf, arrangements)}
          </span>
        </button>
        {/* The name keeps some room: the buttons go under it, and wrap, on a narrow screen. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Link
            href={pdfHref(pdf.id, `/munkater/enektar/${songId}/szerkesztes`)}
            title={format(t.openTitle, { name: pdf.name })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ExternalLinkIcon />
            {t.open}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={format(t.editTitle, { name: pdf.name })}
            aria-expanded={editing}
            onClick={() => onEdit(!editing)}
          >
            <PencilIcon />
            {t.edit}
          </Button>
          <RemovePdfButton pdf={pdf} />
        </div>
      </div>
      <KeptPanel panel={panel} open={editing} onOpen={() => onEdit(true)}>
        <EditPdfForm
          pdf={pdf}
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

function AddPdfForm({
  songId,
  arrangements,
  limits,
}: {
  songId: string;
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.pdfs;
  const tooLarge = format(t.fileTooLarge, { mb: limits.maxBytes / (1024 * 1024) });

  /**
   * Puts the file directly to Storage (a Vercel Function accepts at most
   * 4.5 MB), then adds it. The server checks the stored file again.
   */
  async function uploadPdf(formData: FormData): Promise<FormState> {
    const file = formData.get("pdf");
    if (!(file instanceof File) || file.size === 0) return fileError(m.server.pdfs.chooseFile);
    // Storage refuses a larger file too. This says why at once.
    if (file.size > limits.maxBytes) return fileError(tooLarge);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return fileError(t.fileType);

    const upload = await startPdfUploadAction(songId);
    if (!("uploadUrl" in upload)) return upload;

    let response: Response;
    try {
      response = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "content-type": "application/pdf",
          "cache-control": "max-age=31536000",
          "x-upsert": "false",
        },
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

    formData.delete("pdf");
    formData.set("songId", songId);
    formData.set("path", upload.path);
    formData.set("fileName", file.name);
    return addPdfAction(initialState, formData);
  }

  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(formRef, uploadPdf, {
    connectionFailed: t.connectionFailed,
    onSuccess: (form) => form.reset(),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = useFileDropTarget(
    pending
      ? null
      : {
          id: "pdfs",
          label: t.add,
          kinds: ["pdf"],
          element: formRef,
          onFiles: (files) => setInputFile(fileRef.current, files[0]!),
        },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        name="pdf-file"
        label={t.file}
        hint={format(t.fileHint, { mb: limits.maxBytes / (1024 * 1024) })}
        errors={state.fieldErrors.pdf}
      >
        <Input
          ref={fileRef}
          id="pdf-file"
          name="pdf"
          type="file"
          accept=".pdf,application/pdf"
          required
          aria-invalid={(state.fieldErrors.pdf?.length ?? 0) > 0 || undefined}
          aria-describedby="pdf-file-description"
          className={cn(drop.selected && DROP_SELECTED)}
        />
      </Field>
      <PdfFields id="pdf" arrangements={arrangements} limits={limits} state={state} />
      <SaveStatus state={state} pending={pending} pendingLabel={t.pending} />
    </form>
  );
}

function EditPdfForm({
  pdf,
  arrangements,
  limits,
  onSaved,
  onCancel,
}: {
  pdf: SongPdfDTO;
  arrangements: Arrangement[];
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes and closes the form. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.pdfs;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(
    formRef,
    (formData) => updatePdfAction(initialState, formData),
    {
      connectionFailed: t.connectionFailed,
      onSuccess: onSaved,
    },
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg bg-surface-sunken/50 p-3"
    >
      <input type="hidden" name="id" value={pdf.id} />
      <PdfFields
        id={`edit-${pdf.id}`}
        pdf={pdf}
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

/** The name, the arrangements and the keys of a PDF file. `pdf` gives the values to edit. */
function PdfFields({
  id,
  pdf,
  arrangements,
  limits,
  state,
}: {
  id: string;
  pdf?: SongPdfDTO;
  arrangements: Arrangement[];
  limits: Limits;
  state: FormState;
}) {
  const { m } = useI18n();
  return (
    <AttachmentFields
      id={id}
      values={pdf}
      arrangements={arrangements}
      nameMaxLength={limits.nameMaxLength}
      errors={state.fieldErrors}
      texts={m.songs.pdfs}
    />
  );
}

function RemovePdfButton({ pdf }: { pdf: SongPdfDTO }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.songs(), removePdfAction),
    initialState,
  );
  const [open, setOpen] = useState(false);
  const { m, format } = useI18n();
  const t = m.songs.pdfs;

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
              title={format(t.removeTitle, { name: pdf.name })}
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
          <strong className="text-text">{format(chunk, { name: pdf.name })}</strong>
        ),
      })}
      id={pdf.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.remove}
      pendingLabel={t.removePending}
    />
  );
}

function fileError(message: string): FormState {
  return { status: "error", message: null, fieldErrors: { pdf: [message] } };
}

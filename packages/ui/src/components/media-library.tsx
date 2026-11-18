"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cn } from "../cn";
import { Badge } from "./badge";
import { Button } from "./button";
import { Dialog, DialogClose } from "./dialog";
import { Checkbox, Input, Textarea } from "./fields";

/**
 * Media library UI (FR-306, C-06): grid of uploaded files, upload form (alt text required unless
 * the image is decorative, people-consent flag, rights confirmation), edit and delete, storage
 * quota, and a picker dialog for the rich-text editor. Presentational: data and mutations come
 * through props, all text through `labels`.
 */

export interface MediaItem {
  id: string;
  filename: string;
  kind: "image" | "pdf" | "audio" | "other";
  /** Where the thumbnail/image is served; `null` for non-images. */
  src: string | null;
  alt: string | null;
  decorative: boolean;
  caption: string | null;
  peopleConsent: boolean;
  width: number | null;
  height: number | null;
  bytes: number;
}

/** What the upload form hands to the host after validation. */
export interface MediaUploadInput {
  filename: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  decorative: boolean;
  caption: string | null;
  peopleConsent: boolean;
}

export interface MediaLibraryLabels {
  gridLabel: string;
  empty: string;
  usage: (used: string, quota: string) => string;
  usageMeterLabel: string;
  uploadTitle: string;
  fileLabel: string;
  fileHelp: string;
  fileRequired: string;
  altLabel: string;
  altHelp: string;
  altRequired: string;
  decorative: string;
  captionLabel: string;
  peopleConsent: string;
  peopleConsentHelp: string;
  rights: string;
  rightsRequired: string;
  upload: string;
  uploading: string;
  uploaded: (filename: string) => string;
  uploadFailed: string;
  editText: string;
  editAria: (filename: string) => string;
  editTitle: string;
  save: string;
  saved: string;
  saveFailed: string;
  deleteText: string;
  deleteAria: (filename: string) => string;
  deleteTitle: string;
  deleteConfirm: (filename: string) => string;
  deleteAction: string;
  deleted: string;
  cancel: string;
  close: string;
  selectText: string;
  selectAria: (filename: string) => string;
  pickerTitle: string;
  pickerDescription: string;
  kindPdf: string;
  kindAudio: string;
  kindOther: string;
  noAlt: string;
  decorativeBadge: string;
  consentBadge: string;
}

type Result = { ok: true } | { ok: false; error?: string };

export interface MediaLibraryProps {
  items: MediaItem[];
  usage: { bytes: number; quotaBytes: number };
  labels: MediaLibraryLabels;
  onUpload: (input: MediaUploadInput) => Promise<Result>;
  onUpdate: (
    id: string,
    patch: {
      alt: string | null;
      decorative: boolean;
      caption: string | null;
      peopleConsent: boolean;
    },
  ) => Promise<Result>;
  onDelete: (id: string) => Promise<Result>;
  /** Pick mode (inside `MediaPicker`): tiles select instead of edit/delete. */
  onSelect?: (item: MediaItem) => void;
  /** Only images are listed and selectable. */
  imagesOnly?: boolean;
}

const UNITS = ["B", "KB", "MB", "GB"] as const;

/** `1,2 MB`: Hungarian decimal comma. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = new Intl.NumberFormat("hu-HU", {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
  return `${text} ${UNITS[unit]}`;
}

function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || typeof URL.createObjectURL !== "function") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    // An image the browser cannot decode must not block the upload.
    setTimeout(() => resolve(null), 1500);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

interface UploadErrors {
  file?: string;
  alt?: string;
  rights?: string;
}

function UploadForm({
  labels,
  onUpload,
}: {
  labels: MediaLibraryLabels;
  onUpload: MediaLibraryProps["onUpload"];
}) {
  const fileId = useId();
  const fileHelpId = `${fileId}-help`;
  const fileErrId = `${fileId}-err`;
  const formRef = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [caption, setCaption] = useState("");
  const [peopleConsent, setPeopleConsent] = useState(false);
  const [rights, setRights] = useState(false);
  const [errors, setErrors] = useState<UploadErrors>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (
      file === null ||
      !file.type.startsWith("image/") ||
      typeof URL.createObjectURL !== "function"
    )
      return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isImage = file?.type.startsWith("image/") ?? false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: UploadErrors = {};
    if (file === null) next.file = labels.fileRequired;
    if (isImage && !decorative && alt.trim() === "") next.alt = labels.altRequired;
    if (!rights) next.rights = labels.rightsRequired;
    setErrors(next);
    setStatus(null);
    if (file === null || Object.keys(next).length > 0) return;
    setBusy(true);
    const size = isImage ? await readDimensions(file) : null;
    const result = await onUpload({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
      alt: isImage && !decorative ? alt.trim() : null,
      decorative: isImage && decorative,
      caption: caption.trim() === "" ? null : caption.trim(),
      peopleConsent: isImage && peopleConsent,
    });
    setBusy(false);
    if (result.ok) {
      setStatus({ tone: "ok", text: labels.uploaded(file.name) });
      formRef.current?.reset();
      setFile(null);
      setPreview(null);
      setAlt("");
      setDecorative(false);
      setCaption("");
      setPeopleConsent(false);
      setRights(false);
    } else {
      setStatus({ tone: "error", text: result.error ?? labels.uploadFailed });
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void submit(e)}
      noValidate
      className="grid gap-4 rounded-lg border-2 border-border bg-surface-raised p-4"
      aria-labelledby={`${fileId}-title`}
      data-testid="media-upload"
    >
      <h3 id={`${fileId}-title`} className="font-heading text-fs-4 font-bold">
        {labels.uploadTitle}
      </h3>
      <div className="grid gap-1.5">
        <label htmlFor={fileId} className="text-fs-3 font-semibold">
          {labels.fileLabel}
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/*,application/pdf,audio/*"
          aria-describedby={[errors.file ? fileErrId : null, fileHelpId].filter(Boolean).join(" ")}
          aria-invalid={errors.file ? true : undefined}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setErrors((prev) => ({ ...prev, file: undefined }));
          }}
          className="block min-h-(--control-h-md) w-full rounded-md border-2 border-border-strong bg-surface-raised p-2 text-fs-3 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-primary-contrast"
        />
        {errors.file ? (
          <p id={fileErrId} className="text-fs-2 font-semibold text-danger">
            {errors.file}
          </p>
        ) : null}
        <p id={fileHelpId} className="text-fs-2 text-muted">
          {labels.fileHelp}
        </p>
      </div>
      {preview !== null && isImage ? (
        <img src={preview} alt="" className="max-h-40 w-auto max-w-full rounded-md" />
      ) : null}
      {isImage ? (
        <>
          <Textarea
            label={labels.altLabel}
            help={labels.altHelp}
            error={errors.alt}
            rows={2}
            maxLength={300}
            required={!decorative}
            disabled={decorative}
            value={alt}
            onChange={(e) => {
              setAlt(e.target.value);
              setErrors((prev) => ({ ...prev, alt: undefined }));
            }}
          />
          <Checkbox
            label={labels.decorative}
            checked={decorative}
            onChange={(e) => {
              setDecorative(e.target.checked);
              setErrors((prev) => ({ ...prev, alt: undefined }));
            }}
          />
          <Checkbox
            label={labels.peopleConsent}
            help={labels.peopleConsentHelp}
            checked={peopleConsent}
            onChange={(e) => setPeopleConsent(e.target.checked)}
          />
        </>
      ) : null}
      <Input
        label={labels.captionLabel}
        maxLength={500}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
      />
      <Checkbox
        label={labels.rights}
        error={errors.rights}
        required
        checked={rights}
        onChange={(e) => {
          setRights(e.target.checked);
          setErrors((prev) => ({ ...prev, rights: undefined }));
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? labels.uploading : labels.upload}
        </Button>
        <p
          role="status"
          className={cn(
            "text-fs-3 font-semibold",
            status?.tone === "error" ? "text-danger" : "text-success",
          )}
        >
          {status?.text}
        </p>
      </div>
    </form>
  );
}

function Thumb({ item, labels }: { item: MediaItem; labels: MediaLibraryLabels }) {
  if (item.kind === "image" && item.src !== null) {
    return (
      <img
        src={item.src}
        alt={item.decorative ? "" : (item.alt ?? "")}
        className="aspect-4/3 w-full rounded-t-md bg-surface-sunken object-cover"
        loading="lazy"
      />
    );
  }
  const kind =
    item.kind === "pdf"
      ? labels.kindPdf
      : item.kind === "audio"
        ? labels.kindAudio
        : labels.kindOther;
  return (
    <div
      className="flex aspect-4/3 w-full items-center justify-center rounded-t-md bg-surface-sunken text-fs-5 font-bold text-muted"
      aria-hidden="true"
    >
      {kind}
    </div>
  );
}

function EditDialog({
  item,
  labels,
  onUpdate,
  onClose,
}: {
  item: MediaItem;
  labels: MediaLibraryLabels;
  onUpdate: MediaLibraryProps["onUpdate"];
  onClose: () => void;
}) {
  const [alt, setAlt] = useState(item.alt ?? "");
  const [decorative, setDecorative] = useState(item.decorative);
  const [caption, setCaption] = useState(item.caption ?? "");
  const [consent, setConsent] = useState(item.peopleConsent);
  const [error, setError] = useState<string | undefined>();
  const isImage = item.kind === "image";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isImage && !decorative && alt.trim() === "") {
      setError(labels.altRequired);
      return;
    }
    const result = await onUpdate(item.id, {
      alt: isImage && !decorative ? alt.trim() : null,
      decorative: isImage && decorative,
      caption: caption.trim() === "" ? null : caption.trim(),
      peopleConsent: consent,
    });
    if (result.ok) onClose();
    else setError(result.error ?? labels.saveFailed);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={labels.editTitle}
      description={item.filename}
      closeLabel={labels.close}
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
        {isImage ? (
          <>
            <Textarea
              label={labels.altLabel}
              help={labels.altHelp}
              error={error}
              rows={2}
              maxLength={300}
              required={!decorative}
              disabled={decorative}
              value={alt}
              onChange={(e) => {
                setAlt(e.target.value);
                setError(undefined);
              }}
            />
            <Checkbox
              label={labels.decorative}
              checked={decorative}
              onChange={(e) => {
                setDecorative(e.target.checked);
                setError(undefined);
              }}
            />
            <Checkbox
              label={labels.peopleConsent}
              help={labels.peopleConsentHelp}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
          </>
        ) : null}
        <Input
          label={labels.captionLabel}
          maxLength={500}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {labels.cancel}
            </Button>
          </DialogClose>
          <Button type="submit">{labels.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  item,
  labels,
  onDelete,
  onClose,
}: {
  item: MediaItem;
  labels: MediaLibraryLabels;
  onDelete: MediaLibraryProps["onDelete"];
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={labels.deleteTitle}
      description={labels.deleteConfirm(item.filename)}
      closeLabel={labels.close}
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {labels.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              void onDelete(item.id).then(onClose);
            }}
          >
            {labels.deleteAction}
          </Button>
        </>
      }
    />
  );
}

/** Library: quota, upload form and the grid of files with edit/delete (or select in pick mode). */
export function MediaLibrary({
  items,
  usage,
  labels,
  onUpload,
  onUpdate,
  onDelete,
  onSelect,
  imagesOnly,
}: MediaLibraryProps) {
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState<MediaItem | null>(null);
  const shown = imagesOnly ? items.filter((i) => i.kind === "image") : items;
  const ratio = usage.quotaBytes > 0 ? Math.min(1, usage.bytes / usage.quotaBytes) : 0;
  const usageText = labels.usage(formatBytes(usage.bytes), formatBytes(usage.quotaBytes));

  return (
    <div className="grid gap-6" data-testid="media-library">
      <div className="grid gap-2">
        <p className="text-fs-3 font-semibold" data-testid="media-usage">
          {usageText}
        </p>
        <div
          role="meter"
          aria-label={labels.usageMeterLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuetext={usageText}
          className="h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
        >
          <div className="h-full bg-primary" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
      <UploadForm labels={labels} onUpload={onUpload} />
      {shown.length === 0 ? (
        <p className="text-fs-3 text-muted">{labels.empty}</p>
      ) : (
        <ul
          aria-label={labels.gridLabel}
          className="grid grid-cols-1 gap-4 min-[30rem]:grid-cols-2 lg:grid-cols-3"
          data-testid="media-grid"
        >
          {shown.map((item) => (
            <li
              key={item.id}
              data-media-id={item.id}
              className="flex flex-col overflow-hidden rounded-md border-2 border-border bg-surface-raised"
            >
              <Thumb item={item} labels={labels} />
              <div className="grid flex-1 content-start gap-2 p-3">
                <p className="text-fs-3 font-semibold break-all">{item.filename}</p>
                <p className="text-fs-2 text-muted">
                  {formatBytes(item.bytes)}
                  {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.kind === "image" && item.decorative ? (
                    <Badge tone="neutral">{labels.decorativeBadge}</Badge>
                  ) : null}
                  {item.kind === "image" && !item.decorative && !(item.alt ?? "").trim() ? (
                    <Badge tone="danger">{labels.noAlt}</Badge>
                  ) : null}
                  {item.peopleConsent ? <Badge tone="success">{labels.consentBadge}</Badge> : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {onSelect ? (
                    <Button
                      type="button"
                      size="sm"
                      aria-label={labels.selectAria(item.filename)}
                      onClick={() => onSelect(item)}
                    >
                      {labels.selectText}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={labels.editAria(item.filename)}
                        onClick={() => setEditing(item)}
                      >
                        {labels.editText}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={labels.deleteAria(item.filename)}
                        onClick={() => setDeleting(item)}
                      >
                        {labels.deleteText}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <EditDialog
          key={editing.id}
          item={editing}
          labels={labels}
          onUpdate={onUpdate}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          item={deleting}
          labels={labels}
          onDelete={onDelete}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

export interface MediaPickerProps extends Omit<MediaLibraryProps, "onSelect" | "imagesOnly"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MediaItem) => void;
}

/** Dialog around the library in pick mode (images only), used by the editor's image button. */
export function MediaPicker({ open, onOpenChange, onSelect, ...library }: MediaPickerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={library.labels.pickerTitle}
      description={library.labels.pickerDescription}
      closeLabel={library.labels.close}
      wide
    >
      <MediaLibrary {...library} imagesOnly onSelect={onSelect} />
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  MediaLibrary,
  MediaPicker,
  type MediaItem,
  type MediaLibraryLabels,
  type MediaLibraryProps,
} from "@churchy/ui";
import { useT } from "@/i18n/client";
import {
  deleteMedia,
  updateMedia,
  uploadMedia,
  type MediaActionResult,
  type MediaLibraryState,
} from "./actions";

/** Message-backed labels of the media library (shared by the library and the picker demo). */
export function useMediaLabels(): MediaLibraryLabels {
  const t = useT("dev.media.library");
  return useMemo<MediaLibraryLabels>(
    () => ({
      gridLabel: t("gridLabel"),
      empty: t("empty"),
      usage: (used, quota) => t("usage", { used, quota }),
      usageMeterLabel: t("usageMeterLabel"),
      uploadTitle: t("uploadTitle"),
      fileLabel: t("fileLabel"),
      fileHelp: t("fileHelp"),
      fileRequired: t("fileRequired"),
      altLabel: t("altLabel"),
      altHelp: t("altHelp"),
      altRequired: t("altRequired"),
      decorative: t("decorative"),
      captionLabel: t("captionLabel"),
      peopleConsent: t("peopleConsent"),
      peopleConsentHelp: t("peopleConsentHelp"),
      rights: t("rights"),
      rightsRequired: t("rightsRequired"),
      upload: t("upload"),
      uploading: t("uploading"),
      uploaded: (filename) => t("uploaded", { filename }),
      uploadFailed: t("uploadFailed"),
      editText: t("editText"),
      editAria: (filename) => t("editAria", { filename }),
      editTitle: t("editTitle"),
      save: t("save"),
      saved: t("saved"),
      saveFailed: t("saveFailed"),
      deleteText: t("deleteText"),
      deleteAria: (filename) => t("deleteAria", { filename }),
      deleteTitle: t("deleteTitle"),
      deleteConfirm: (filename) => t("deleteConfirm", { filename }),
      deleteAction: t("deleteAction"),
      deleted: t("deleted"),
      cancel: t("cancel"),
      close: t("close"),
      selectText: t("selectText"),
      selectAria: (filename) => t("selectAria", { filename }),
      pickerTitle: t("pickerTitle"),
      pickerDescription: t("pickerDescription"),
      kindPdf: t("kindPdf"),
      kindAudio: t("kindAudio"),
      kindOther: t("kindOther"),
      noAlt: t("noAlt"),
      decorativeBadge: t("decorativeBadge"),
      consentBadge: t("consentBadge"),
    }),
    [t],
  );
}

/** Library state plus the mutations, backed by the demo server actions. */
export function useMediaState(initial: MediaLibraryState) {
  const [state, setState] = useState(initial);
  const apply = async (run: Promise<MediaActionResult>) => {
    const result = await run;
    if (result.ok) setState(result.state);
    return result.ok ? ({ ok: true } as const) : ({ ok: false } as const);
  };
  const handlers: Pick<MediaLibraryProps, "onUpload" | "onUpdate" | "onDelete"> = {
    onUpload: (input) => apply(uploadMedia(input)),
    onUpdate: (id, patch) => apply(updateMedia(id, patch)),
    onDelete: (id) => apply(deleteMedia(id)),
  };
  return { state, handlers, setState };
}

export function MediaLibraryDemo({ initial }: { initial: MediaLibraryState }) {
  const labels = useMediaLabels();
  const { state, handlers } = useMediaState(initial);
  return <MediaLibrary items={state.items} usage={state.usage} labels={labels} {...handlers} />;
}

export interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MediaItem) => void;
  state: ReturnType<typeof useMediaState>;
}

export function ImagePickerDialog({ open, onOpenChange, onSelect, state }: ImagePickerDialogProps) {
  const labels = useMediaLabels();
  return (
    <MediaPicker
      open={open}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
      items={state.state.items}
      usage={state.state.usage}
      labels={labels}
      {...state.handlers}
    />
  );
}

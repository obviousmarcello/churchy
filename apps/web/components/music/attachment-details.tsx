"use client";

import { useNoteNames } from "@/components/music/note-names";
import { useI18n } from "@/i18n/music/client";
import type { Attachment } from "@/lib/music/attachments";
import { fromEnglish } from "@/lib/music/chords/notation";

type Arrangement = { id: string; name: string };

/**
 * Gives the arrangements and the keys of a PDF file or an image as one line,
 * e.g. "Acoustic · Keys: G, A", with the keys in the user's note names.
 * `arrangements` are the arrangements of the song.
 */
export function useAttachmentDetails() {
  const { m, plural } = useI18n();
  const noteNames = useNoteNames();
  const t = m.songs.browser.details;

  return (attachment: Attachment, arrangements: Arrangement[]) => {
    const names = arrangements
      .filter(({ id }) => attachment.arrangementIds.includes(id))
      .map(({ name }) => name);
    const parts = [names.length > 0 ? names.join(", ") : t.allArrangements];
    if (attachment.keys.length > 0) {
      const keys = attachment.keys.map((key) => fromEnglish(key, noteNames)).join(", ");
      parts.push(plural(t.attachmentKeys, attachment.keys.length, { keys }));
    }
    return parts.join(m.common.separator);
  };
}

/** The details of `useAttachmentDetails`, after the title of the song. */
export function AttachmentDetails({
  songTitle,
  attachment,
  arrangements,
}: {
  songTitle: string;
  attachment: Attachment;
  arrangements: Arrangement[];
}) {
  const { m } = useI18n();
  const details = useAttachmentDetails();
  return `${songTitle}${m.common.separator}${details(attachment, arrangements)}`;
}

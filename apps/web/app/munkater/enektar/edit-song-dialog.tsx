"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { PencilIcon } from "lucide-react";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import * as server from "./[id]/szerkesztes/actions";
import type { FormState } from "@/server/music/form-state";
import { SongForm, type SongFormValues } from "./song-form";

/** The song to edit, and the arrangement to edit with it. */
// The server actions are wrapped by `withPolicy`; the dialog wants the values.
async function getSongFormValuesAction(songId: string, arrangementId: string) {
  const outcome = await server.getSongFormValuesAction(songId, arrangementId);
  return outcome.ok ? outcome.value : null;
}
async function updateSongInPlaceAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const outcome = await server.updateSongInPlaceAction(previous, formData);
  return outcome.ok ? outcome.value : { status: "error", message: "", fieldErrors: {} };
}

/** The song to edit, and the arrangement to edit with it. */
export type EditSongTarget = { songId: string; arrangementId: string };

/** The pencil button of a song row that opens `EditSongDialog`. */
export function EditSongButton({ title, onClick }: { title: string; onClick: () => void }) {
  const { m, format } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={format(m.songs.editDialog.buttonLabel, { title })}
      title={m.songs.editDialog.button}
      onClick={onClick}
    >
      <PencilIcon />
    </Button>
  );
}

/**
 * Edits a song and one of its arrangements, as on the edit page, e.g. from a
 * setlist or the items of an event. Open while `target` is set. After a save,
 * the page shows the new values.
 */
export function EditSongDialog({
  target,
  onClose,
  onSaved,
}: {
  target: EditSongTarget | null;
  onClose: () => void;
  /** After a save, before the close: not after a cancel. */
  onSaved?: () => void;
}) {
  // Keep the last song while the dialog animates out.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const { m } = useI18n();

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-2xl")}>
          <DialogHeader>
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {m.songs.editDialog.title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">
              {m.songs.editDialog.description}
            </Dialog.Description>
          </DialogHeader>
          {/* A new form for each song, so it starts with that song's values. */}
          {shown && (
            <EditSongContent
              key={shown.arrangementId}
              target={shown}
              onClose={onClose}
              onSaved={onSaved}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditSongContent({
  target,
  onClose,
  onSaved,
}: {
  target: EditSongTarget;
  onClose: () => void;
  onSaved?: () => void;
}) {
  // The pages have only the summaries of the arrangements, so the chart loads when the dialog opens.
  const [song, setSong] = useState<SongFormValues | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const { m } = useI18n();

  useEffect(() => {
    let current = true;
    getSongFormValuesAction(target.songId, target.arrangementId).then(
      (values) => {
        if (current) setSong(values);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [target.songId, target.arrangementId]);

  if (failed || song === null) {
    return (
      <>
        <DialogBody>
          <p role="alert" className="text-sm text-danger">
            {failed ? m.songs.editDialog.loadFailed : m.songs.editDialog.notFound}
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogActions>
            <Button type="button" variant="outline" onClick={onClose}>
              {m.common.actions.close}
            </Button>
          </DialogActions>
        </DialogFooter>
      </>
    );
  }
  if (song === undefined) {
    return (
      <DialogBody>
        <p className="text-sm text-muted">{m.songs.editDialog.loading}</p>
      </DialogBody>
    );
  }

  return (
    <SongForm
      action={updateSongInPlaceAction}
      song={song}
      submitLabel={m.songs.editDialog.submit}
      pendingLabel={m.songs.editDialog.pending}
      cancel={onClose}
      onSaved={() => {
        onSaved?.();
        onClose();
      }}
    />
  );
}

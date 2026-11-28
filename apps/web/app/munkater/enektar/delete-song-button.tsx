"use client";

import { useActionState, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { ConfirmDialog, ConfirmDialogTrigger } from "@/components/music/form-parts";
import { invalidatePageCache, invalidating } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { changedPages } from "@/lib/music/page-keys";
import type { FormState } from "@/server/music/form-state";
import { usePolicyAction } from "@/lib/music/policy-form";
import { deleteSongAction, deleteSongInPlaceAction } from "./[id]/szerkesztes/actions";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * Only for song admins and superadmins. With `onDeleted` it stays on the
 * page and calls it after the delete, e.g. to close the song. Without it,
 * it goes to the song list.
 */
export function DeleteSongButton({
  songId,
  title,
  variant = "destructive",
  onDeleted,
}: {
  songId: string;
  title: string;
  /** "ghost": a quiet red text button, e.g. in the song details. */
  variant?: "destructive" | "ghost";
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleteInPlace = usePolicyAction(deleteSongInPlaceAction);
  const deleteAndLeave = usePolicyAction(deleteSongAction);
  const [state, formAction, pending] = useActionState(
    onDeleted
      ? async (previous: FormState, formData: FormData) => {
          invalidatePageCache(changedPages.songs());
          const result = await deleteInPlace(previous, formData);
          // In the action, not in the render: the refresh of the action
          // removes the song, and this button with it.
          if (result.status === "success") {
            setOpen(false);
            onDeleted();
          }
          return result;
        }
      : invalidating(changedPages.songs(), deleteAndLeave),
    initialState,
  );
  const { m, format } = useI18n();
  const t = m.songs.edit.delete;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <ConfirmDialogTrigger
          render={
            <Button
              type="button"
              variant={variant}
              className={variant === "ghost" ? "w-fit text-danger hover:text-danger" : "w-fit"}
            />
          }
        >
          <Trash2Icon />
          {t.trigger}
        </ConfirmDialogTrigger>
      }
      title={t.confirmTitle}
      description={rich(t.confirmDescription, {
        // The title goes in after the markup is read, so a title with "<…>" stays text.
        strong: (chunk) => <strong className="text-text">{format(chunk, { title })}</strong>,
      })}
      id={songId}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.trigger}
      pendingLabel={m.common.actions.deleting}
    />
  );
}

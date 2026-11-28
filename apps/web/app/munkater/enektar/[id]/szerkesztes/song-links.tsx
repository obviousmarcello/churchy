"use client";

import { useActionState, useRef, useState } from "react";
import { LinkIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { useAttachmentDetails } from "@/components/music/attachment-details";
import { AttachmentFields } from "@/components/music/attachment-fields";
import { Field } from "@/components/music/form-field";
import { ConfirmDialog, ConfirmDialogTrigger, FormSection } from "@/components/music/form-parts";
import { invalidating } from "@/components/music/page-cache";
import { KeptPanel, SaveStatus, useKeptPanel } from "@/components/music/page-save";
import { PreviewLayout } from "@/components/music/preview-layout";
import { SongLinkAnchor } from "@/components/music/song-media";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { rich } from "@/i18n/music/rich";
import { LINK_URL_MAX_LENGTH } from "@/lib/music/links";
import { changedPages } from "@/lib/music/page-keys";
import type { FormState } from "@/server/music/form-state";
import type { SongLinkDTO } from "@/server/music/models/links";
import { addLinkAction, removeLinkAction, updateLinkAction } from "./file-actions-client";
import { useAttachmentForm } from "./use-attachment-form";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

type Arrangement = { id: string; name: string };

type Limits = {
  /** The most links of a song. */
  maxLinks: number;
  nameMaxLength: number;
};

/**
 * The links of a song, e.g. to YouTube: add, edit (address, name,
 * arrangements and keys) and remove them. Only for song admins and
 * superadmins.
 */
export function SongLinks({
  songId,
  links,
  arrangements,
  limits,
}: {
  songId: string;
  links: SongLinkDTO[];
  /** The arrangements of the song, that a link can be for. */
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m, format } = useI18n();
  const t = m.songs.links;
  // One link at a time shows its edit form.
  const [editing, setEditing] = useState<string | null>(null);
  const full = links.length >= limits.maxLinks;

  return (
    <PreviewLayout>
      <FormSection title={t.title} description={t.description}>
        {links.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-card border border-dashed px-4 py-6 text-center">
            <LinkIcon aria-hidden className="mb-1 size-5 text-muted" />
            <p className="text-sm font-medium">{t.emptyTitle}</p>
            <p className="text-sm text-muted">{t.emptyDescription}</p>
          </div>
        ) : (
          <ul aria-label={t.list} className="flex flex-col divide-y rounded-card border">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                arrangements={arrangements}
                limits={limits}
                editing={editing === link.id}
                onEdit={(edit) => setEditing(edit ? link.id : null)}
              />
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-4 border-t pt-4">
          <h3 className="text-sm font-medium">{t.add}</h3>
          {full ? (
            <p className="text-sm text-muted">{format(t.limitReached, { max: limits.maxLinks })}</p>
          ) : (
            <AddLinkForm songId={songId} arrangements={arrangements} limits={limits} />
          )}
        </section>
      </FormSection>
    </PreviewLayout>
  );
}

function LinkRow({
  link,
  arrangements,
  limits,
  editing,
  onEdit,
}: {
  link: SongLinkDTO;
  arrangements: Arrangement[];
  limits: Limits;
  editing: boolean;
  onEdit: (editing: boolean) => void;
}) {
  const { m, format } = useI18n();
  const t = m.songs.links;
  const details = useAttachmentDetails();
  const panel = useKeptPanel(editing);

  return (
    <li className="flex flex-col gap-3 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <SongLinkAnchor
          link={link}
          details={details(link, arrangements)}
          className="-mx-1 flex-1 basis-48 rounded-control px-1 py-0.5"
        />
        {/* The name keeps some room: the buttons go under it, and wrap, on a narrow screen. */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title={format(t.editTitle, { name: link.name })}
            aria-expanded={editing}
            onClick={() => onEdit(!editing)}
          >
            <PencilIcon />
            {t.edit}
          </Button>
          <RemoveLinkButton link={link} />
        </div>
      </div>
      <KeptPanel panel={panel} open={editing} onOpen={() => onEdit(true)}>
        <EditLinkForm
          link={link}
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

function AddLinkForm({
  songId,
  arrangements,
  limits,
}: {
  songId: string;
  arrangements: Arrangement[];
  limits: Limits;
}) {
  const { m } = useI18n();
  const t = m.songs.links;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(
    formRef,
    (formData) => addLinkAction(initialState, formData),
    {
      connectionFailed: t.connectionFailed,
      onSuccess: (form) => form.reset(),
    },
  );

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="songId" value={songId} />
      <LinkFields id="link" arrangements={arrangements} limits={limits} state={state} />
      <SaveStatus state={state} pending={pending} pendingLabel={t.pending} />
    </form>
  );
}

function EditLinkForm({
  link,
  arrangements,
  limits,
  onSaved,
  onCancel,
}: {
  link: SongLinkDTO;
  arrangements: Arrangement[];
  limits: Limits;
  onSaved: () => void;
  /** Discards the changes and closes the form. */
  onCancel: () => void;
}) {
  const { m } = useI18n();
  const t = m.songs.links;
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useAttachmentForm(
    formRef,
    (formData) => updateLinkAction(initialState, formData),
    {
      connectionFailed: t.connectionFailed,
      onSuccess: onSaved,
    },
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-card bg-surface-sunken/50 p-3"
    >
      <input type="hidden" name="id" value={link.id} />
      <LinkFields
        id={`edit-${link.id}`}
        link={link}
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

/** The address, the name, the arrangements and the keys of a link. `link` gives the values to edit. */
function LinkFields({
  id,
  link,
  arrangements,
  limits,
  state,
}: {
  id: string;
  link?: SongLinkDTO;
  arrangements: Arrangement[];
  limits: Limits;
  state: FormState;
}) {
  const { m } = useI18n();
  const t = m.songs.links;
  const errors = state.fieldErrors.url;

  return (
    <>
      <Field name={`${id}-url`} label={t.url} hint={t.urlHint} errors={errors}>
        <Input
          id={`${id}-url`}
          name="url"
          // Not `type="url"`: the server also takes an address without `https://`, e.g. youtu.be/….
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          defaultValue={link?.url}
          maxLength={LINK_URL_MAX_LENGTH}
          required
          aria-invalid={(errors?.length ?? 0) > 0 || undefined}
          aria-describedby={`${id}-url-description`}
        />
      </Field>
      <AttachmentFields
        id={id}
        values={link}
        arrangements={arrangements}
        nameMaxLength={limits.nameMaxLength}
        errors={state.fieldErrors}
        texts={t}
      />
    </>
  );
}

function RemoveLinkButton({ link }: { link: SongLinkDTO }) {
  const [state, formAction, pending] = useActionState(
    invalidating(changedPages.songs(), removeLinkAction),
    initialState,
  );
  const [open, setOpen] = useState(false);
  const { m, format } = useI18n();
  const t = m.songs.links;

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
              title={format(t.removeTitle, { name: link.name })}
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
          <strong className="text-text">{format(chunk, { name: link.name })}</strong>
        ),
      })}
      id={link.id}
      formAction={formAction}
      state={state}
      pending={pending}
      confirmLabel={t.remove}
      pendingLabel={t.removePending}
    />
  );
}

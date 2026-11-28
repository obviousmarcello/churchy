"use client";

import { Field, FieldMessage } from "@/components/music/form-field";
import { useNoteNames } from "@/components/music/note-names";
import { Input } from "@/components/music/ui/input";
import {
  ATTACHMENT_MAJOR_KEYS,
  ATTACHMENT_MINOR_KEYS,
  type Attachment,
} from "@/lib/music/attachments";
import { fromEnglish } from "@/lib/music/chords/notation";

type Arrangement = { id: string; name: string };

/**
 * The name, the arrangements and the keys of a PDF file or an image, as form
 * fields: `name`, one `arrangementIds` and one `keys` field for each checked
 * box. `values` gives the values to edit.
 */
export function AttachmentFields({
  id,
  values,
  arrangements,
  nameMaxLength,
  errors,
  texts,
}: {
  /** Makes the ids of the fields unique on the page. */
  id: string;
  values?: Attachment & { name: string };
  /** The arrangements of the song. */
  arrangements: Arrangement[];
  nameMaxLength: number;
  errors: Record<string, string[]>;
  texts: {
    name: string;
    nameHint: string;
    arrangements: string;
    arrangementsHint: string;
    keys: string;
    keysHint: string;
    majorKeys: string;
    minorKeys: string;
  };
}) {
  const noteNames = useNoteNames();

  return (
    <>
      <Field name={`${id}-name`} label={texts.name} hint={texts.nameHint} errors={errors.name}>
        <Input
          id={`${id}-name`}
          name="name"
          defaultValue={values?.name}
          maxLength={nameMaxLength}
          aria-invalid={(errors.name?.length ?? 0) > 0 || undefined}
          aria-describedby={`${id}-name-description`}
        />
      </Field>

      <fieldset
        className="flex min-w-0 flex-col gap-2"
        aria-describedby={`${id}-arrangements-description`}
      >
        <legend className="mb-2 text-sm font-medium">{texts.arrangements}</legend>
        <div className="flex flex-wrap gap-1.5">
          {arrangements.map((arrangement) => (
            <label key={arrangement.id} className={CHIP}>
              <input
                type="checkbox"
                name="arrangementIds"
                value={arrangement.id}
                defaultChecked={values?.arrangementIds.includes(arrangement.id)}
                className="sr-only"
              />
              {arrangement.name}
            </label>
          ))}
        </div>
        <FieldMessage
          id={`${id}-arrangements-description`}
          hint={texts.arrangementsHint}
          errors={errors.arrangementIds}
        />
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={`${id}-keys-description`}>
        <legend className="mb-2 text-sm font-medium">{texts.keys}</legend>
        {/* The chips follow the width of the form, not of the window. */}
        <div className="@container flex flex-col gap-2">
          {[
            { label: texts.majorKeys, keys: ATTACHMENT_MAJOR_KEYS },
            { label: texts.minorKeys, keys: ATTACHMENT_MINOR_KEYS },
          ].map((group) => (
            <div
              key={group.label}
              role="group"
              aria-label={group.label}
              className="grid grid-cols-4 gap-1.5 @[17rem]:grid-cols-6 @[35rem]:grid-cols-12"
            >
              {group.keys.map((key) => (
                <label key={key} className={CHIP}>
                  <input
                    type="checkbox"
                    name="keys"
                    value={key}
                    defaultChecked={values?.keys.includes(key)}
                    className="sr-only"
                  />
                  {fromEnglish(key, noteNames)}
                </label>
              ))}
            </div>
          ))}
        </div>
        <FieldMessage id={`${id}-keys-description`} hint={texts.keysHint} errors={errors.keys} />
      </fieldset>
    </>
  );
}

/** A checkbox that looks like a button: it is filled when checked. */
const CHIP =
  "flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-control border bg-surface-raised px-2 text-sm transition-colors select-none hover:bg-surface-sunken has-checked:border-primary has-checked:bg-primary has-checked:text-primary-contrast has-focus-visible:ring-3 has-focus-visible:ring-focus/50";

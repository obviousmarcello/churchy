"use client";

import { EmptyState } from "@churchy/ui";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Card } from "@/components/music/ui/card";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { bookName } from "@/lib/music/scripture/book-names";
import { BOOK_IDS } from "@/lib/music/scripture/books";
import { toastError, toastSuccess } from "@/lib/music/toast";
import type { SaveResult } from "@/server/music/form-state";
import type { OwnTranslationDTO } from "@/server/music/models/scripture-translations";
import {
  deleteBookAction,
  deleteTranslationAction,
  putBookAction,
  saveTranslationAction,
  setKaroliAction,
} from "./actions-client";

type Fields = {
  id: string;
  name: string;
  shortName: string;
  notice: string;
  source: "pasted" | "database";
  deuterocanon: boolean;
  enabled: boolean;
  szentiras: string;
  bibliaMindenkie: string;
  bibleComId: string;
  bibleComAbbreviation: string;
};

const EMPTY: Fields = {
  id: "",
  name: "",
  shortName: "",
  notice: "",
  source: "pasted",
  deuterocanon: false,
  enabled: true,
  szentiras: "",
  bibliaMindenkie: "",
  bibleComId: "",
  bibleComAbbreviation: "",
};

function toFields(translation: OwnTranslationDTO): Fields {
  return {
    id: translation.id,
    name: translation.name,
    shortName: translation.shortName,
    notice: translation.notice ?? "",
    source: translation.source === "database" ? "database" : "pasted",
    deuterocanon: translation.deuterocanon,
    enabled: translation.enabled,
    szentiras: translation.sources?.szentiras ?? "",
    bibliaMindenkie: translation.sources?.bibliaMindenkie ?? "",
    bibleComId: translation.sources?.bibleCom ? String(translation.sources.bibleCom.id) : "",
    bibleComAbbreviation: translation.sources?.bibleCom?.abbreviation ?? "",
  };
}

function toInput(fields: Fields) {
  const sources = {
    ...(fields.szentiras.trim() && { szentiras: fields.szentiras.trim() }),
    ...(fields.bibliaMindenkie.trim() && { bibliaMindenkie: fields.bibliaMindenkie.trim() }),
    ...(fields.bibleComId.trim() &&
      fields.bibleComAbbreviation.trim() && {
        bibleCom: {
          id: Number(fields.bibleComId),
          abbreviation: fields.bibleComAbbreviation.trim(),
        },
      }),
  };
  return {
    id: fields.id,
    name: fields.name,
    shortName: fields.shortName,
    notice: fields.notice,
    source: fields.source,
    deuterocanon: fields.deuterocanon,
    enabled: fields.enabled,
    sources: Object.keys(sources).length > 0 ? sources : null,
  };
}

/** The Károli switch, the list of the church's own translations, their form and the text upload. */
export function TranslationsManager({
  karoli,
  translations,
  booksByTranslation,
}: {
  karoli: boolean;
  translations: OwnTranslationDTO[];
  booksByTranslation: Record<string, string[]>;
}) {
  const { m, format } = useI18n();
  const t = m.bibleTranslations;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<{ fields: Fields; isNew: boolean } | null>(null);

  function run(call: () => Promise<SaveResult>, success: string, then?: () => void) {
    startTransition(async () => {
      const result = await call();
      if (result.status === "success") {
        toastSuccess(success);
        then?.();
      } else if (result.message) toastError(result.message);
    });
  }

  return (
    <div data-reveal="" className="flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <p className="text-sm text-muted">{t.page.lead}</p>

      <Card className="flex flex-col gap-1 p-4">
        <h2 className="font-semibold">{t.karoli.title}</h2>
        <p className="text-sm text-muted">{t.karoli.description}</p>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={karoli}
            disabled={pending}
            onChange={(event) => run(() => setKaroliAction(event.target.checked), t.form.saved)}
          />
          {t.karoli.enabled}
        </label>
      </Card>

      <section aria-labelledby="own-translations" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="own-translations" className="font-semibold">
            {t.own.title}
          </h2>
          {!editing && (
            <Button onClick={() => setEditing({ fields: EMPTY, isNew: true })}>{t.own.add}</Button>
          )}
        </div>

        {translations.length === 0 && !editing && <EmptyState size="sm" title={t.own.empty} />}

        {translations.map((translation) => (
          <Card key={translation.id} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {translation.name} <span className="text-muted">({translation.shortName})</span>
                </p>
                <p className="text-xs text-muted">
                  {translation.source === "database" ? t.own.sourceDatabase : t.own.sourcePasted}
                  {" · "}
                  {translation.enabled ? t.own.enabled : t.own.off}
                  {translation.source === "database" &&
                    ` · ${format(t.own.books, { count: translation.books })}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing({ fields: toFields(translation), isNew: false })}
                >
                  {t.own.edit}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(format(t.own.deleteConfirm, { name: translation.name })))
                      return;
                    run(() => deleteTranslationAction(translation.id), t.form.deleted);
                  }}
                >
                  {t.own.delete}
                </Button>
              </div>
            </div>
            {translation.source === "database" && (
              <BookUpload
                translation={translation.id}
                books={booksByTranslation[translation.id] ?? []}
              />
            )}
          </Card>
        ))}

        {editing && (
          <TranslationForm
            key={editing.fields.id || "new"}
            initial={editing.fields}
            isNew={editing.isNew}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(fields) =>
              run(
                () => saveTranslationAction(toInput(fields)),
                t.form.saved,
                () => setEditing(null),
              )
            }
          />
        )}
      </section>
    </div>
  );
}

function TranslationForm({
  initial,
  isNew,
  pending,
  onCancel,
  onSave,
}: {
  initial: Fields;
  isNew: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (fields: Fields) => void;
}) {
  const { m } = useI18n();
  const t = m.bibleTranslations.form;
  const [fields, setFields] = useState(initial);
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <Card className="p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(fields);
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="translation-id">{t.id}</Label>
          <Input
            id="translation-id"
            value={fields.id}
            readOnly={!isNew}
            required
            pattern="[a-z0-9]{1,30}"
            maxLength={30}
            aria-describedby="translation-id-hint"
            onChange={(event) => set("id", event.target.value)}
          />
          <p id="translation-id-hint" className="text-xs text-muted">
            {t.idHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="translation-name">{t.name}</Label>
          <Input
            id="translation-name"
            value={fields.name}
            required
            maxLength={120}
            onChange={(event) => set("name", event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="translation-short">{t.shortName}</Label>
          <Input
            id="translation-short"
            value={fields.shortName}
            required
            maxLength={20}
            aria-describedby="translation-short-hint"
            onChange={(event) => set("shortName", event.target.value)}
          />
          <p id="translation-short-hint" className="text-xs text-muted">
            {t.shortNameHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="translation-notice">{t.notice}</Label>
          <Input
            id="translation-notice"
            value={fields.notice}
            maxLength={500}
            aria-describedby="translation-notice-hint"
            onChange={(event) => set("notice", event.target.value)}
          />
          <p id="translation-notice-hint" className="text-xs text-muted">
            {t.noticeHint}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="translation-source">{t.source}</Label>
          <NativeSelect
            id="translation-source"
            value={fields.source}
            disabled={!isNew}
            onChange={(event) => set("source", event.target.value as Fields["source"])}
          >
            <option value="pasted">{t.sourcePasted}</option>
            <option value="database">{t.sourceDatabase}</option>
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fields.deuterocanon}
            onChange={(event) => set("deuterocanon", event.target.checked)}
          />
          {t.deuterocanon}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fields.enabled}
            onChange={(event) => set("enabled", event.target.checked)}
          />
          {m.bibleTranslations.own.enabled}
        </label>
        <fieldset className="flex flex-col gap-2 rounded border border-border p-3">
          <legend className="px-1 text-sm">{t.links}</legend>
          {(
            [
              ["szentiras", t.szentiras],
              ["bibliaMindenkie", t.bibliaMindenkie],
              ["bibleComId", t.bibleComId],
              ["bibleComAbbreviation", t.bibleComAbbreviation],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <Label htmlFor={`translation-${key}`}>{label}</Label>
              <Input
                id={`translation-${key}`}
                value={fields[key]}
                inputMode={key === "bibleComId" ? "numeric" : undefined}
                onChange={(event) => set(key, event.target.value)}
              />
            </div>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {t.save}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The books of a "database" translation: the uploaded ones with a delete button, and the upload of a book. */
function BookUpload({ translation, books }: { translation: string; books: string[] }) {
  const { m } = useI18n();
  const t = m.bibleTranslations.text;
  const [pending, startTransition] = useTransition();
  const [book, setBook] = useState(BOOK_IDS[0]!);

  function upload(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      const result = await putBookAction(translation, book, await file.text());
      if (result.status === "success") toastSuccess(t.uploaded);
      else toastError(result.message || t.uploadFailed);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <h3 className="text-sm font-medium">{t.title}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`book-${translation}`}>{t.book}</Label>
          <NativeSelect
            id={`book-${translation}`}
            value={book}
            onChange={(event) => setBook(event.target.value)}
          >
            {BOOK_IDS.map((id) => (
              <option key={id} value={id}>
                {bookName(id, "hu")}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`file-${translation}`}>{t.file}</Label>
          <Input
            id={`file-${translation}`}
            type="file"
            accept="application/json,.json"
            disabled={pending}
            aria-describedby={`file-hint-${translation}`}
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      <p id={`file-hint-${translation}`} className="text-xs text-muted">
        {t.fileHint}
      </p>
      {books.length === 0 ? (
        <EmptyState size="sm" title={t.none} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {books.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1 rounded border border-border px-2 py-1 text-sm"
            >
              {bookName(id, "hu")}
              <button
                type="button"
                className="text-muted underline"
                disabled={pending}
                aria-label={`${t.remove}: ${bookName(id, "hu")}`}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteBookAction(translation, id);
                    if (result.status !== "success") toastError(result.message || t.removeFailed);
                  })
                }
              >
                {m.common.actions.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use server";

import { refresh } from "next/cache";

import { type SaveResult, runSave } from "@/server/music/form-state";
import { deleteDatabaseBook, putDatabaseBook } from "@/server/music/models/scripture-books";
import {
  deleteTranslation,
  saveTranslation,
  setKaroliEnabled,
} from "@/server/music/models/scripture-translations";
import { musicScripture } from "@/server/music/policy";
import { withPolicy, type PolicyScope } from "@/server/policy";

// The models validate the input; these actions only turn their errors into a result for the page.

async function save(
  failure: Parameters<typeof runSave>[0]["failure"],
  run: () => Promise<void>,
): Promise<SaveResult> {
  const result = await runSave({ failure, notFound: failure }, async () => {
    await run();
    return true;
  });
  if (result.status === "success") refresh();
  return result;
}

/** Adds or changes a translation of the church (see `saveTranslationSchema`). */
export const saveTranslationAction = withPolicy(
  "music.scripture.translations.manage",
  musicScripture,
  (_scope: PolicyScope, fields: unknown): Promise<SaveResult> =>
    save(
      ({ m }) => m.bibleTranslations.form.saveFailed,
      () => saveTranslation(fields),
    ),
);

export const deleteTranslationAction = withPolicy(
  "music.scripture.translations.manage",
  musicScripture,
  (_scope: PolicyScope, id: string): Promise<SaveResult> =>
    save(
      ({ m }) => m.bibleTranslations.form.deleteFailed,
      () => deleteTranslation(id),
    ),
);

export const setKaroliAction = withPolicy(
  "music.scripture.translations.manage",
  musicScripture,
  (_scope: PolicyScope, enabled: boolean): Promise<SaveResult> =>
    save(
      ({ m }) => m.bibleTranslations.karoliSaveFailed,
      () => setKaroliEnabled(enabled),
    ),
);

/** Stores the text of one book from the JSON of the upload. */
export const putBookAction = withPolicy(
  "music.scripture.translations.manage",
  musicScripture,
  (_scope: PolicyScope, translation: string, book: string, json: string): Promise<SaveResult> =>
    save(
      ({ m }) => m.bibleTranslations.text.uploadFailed,
      async () => {
        let text: unknown;
        try {
          text = JSON.parse(json);
        } catch {
          throw new Error("not JSON");
        }
        await putDatabaseBook({ translation, book, text });
      },
    ),
);

export const deleteBookAction = withPolicy(
  "music.scripture.translations.manage",
  musicScripture,
  (_scope: PolicyScope, translation: string, book: string): Promise<SaveResult> =>
    save(
      ({ m }) => m.bibleTranslations.text.removeFailed,
      () => deleteDatabaseBook(translation, book),
    ),
);

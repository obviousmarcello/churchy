"use server";

import { refresh } from "next/cache";

import { getRequestI18n } from "@/i18n/music/server";
import { errorState, file, runUpdate, text, type FormState } from "@/server/music/form-state";
import {
  addSongImage,
  addSongImagePage,
  moveSongImagePages,
  removeSongImage,
  removeSongImagePage,
  updateSongImage,
} from "@/server/music/models/images";
import { addSongLink, removeSongLink, updateSongLink } from "@/server/music/models/links";
import {
  addSongPdf,
  removeSongPdf,
  startPdfUpload,
  updateSongPdf,
} from "@/server/music/models/pdfs";
import {
  addSongScore,
  removeSongScore,
  replaceSongScore,
  updateSongScore,
} from "@/server/music/models/scores";
import {
  addSongSoundFile,
  removeSongSoundFile,
  startSoundFileUpload,
  updateSongSoundFile,
} from "@/server/music/models/sound-files";
import { musicFiles } from "@/server/music/policy";
import { withPolicy } from "@/server/policy";

// The actions of a song's files (Music Sheet DB's `songs/[id]/edit/actions.ts`, music phase 2b).
// The models check the song admin role and the files; Churchy: `music.song.manage` first.

// The scores of the song. The score functions check the song admin role and the files.

/** Adds a score: `songId`, `name`, `key` and the file `score`. */
export const addScoreAction = withPolicy(
  "music.song.manage",
  musicFiles("scores"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.scoreAdded,
        failure: ({ m }) => m.songs.actions.scoreSaveFailed,
        notFound: ({ m }) => m.songs.actions.scoreNotFound,
      },
      () =>
        addSongScore(
          text(formData, "songId"),
          { name: text(formData, "name"), key: text(formData, "key") },
          file(formData, "score"),
        ),
    );
  },
);

/** Replaces the file of the score `id` with the file `score`, in the key `key`. */
export const replaceScoreAction = withPolicy(
  "music.song.manage",
  musicFiles("scores"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.scoreReplaced,
        failure: ({ m }) => m.songs.actions.scoreSaveFailed,
        notFound: ({ m }) => m.songs.actions.scoreNotFound,
      },
      () =>
        replaceSongScore(
          text(formData, "id"),
          { key: text(formData, "key") },
          file(formData, "score"),
        ),
    );
  },
);

/** Changes the `name` and the `key` of the score `id`. */
export const updateScoreAction = withPolicy(
  "music.song.manage",
  musicFiles("scores"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.scoreSaved,
        failure: ({ m }) => m.songs.actions.scoreSaveFailed,
        notFound: ({ m }) => m.songs.actions.scoreNotFound,
      },
      () =>
        updateSongScore(text(formData, "id"), {
          name: text(formData, "name"),
          key: text(formData, "key"),
        }),
    );
  },
);

/** Removes the score `id`, from the confirmation dialog. */
export const removeScoreAction = withPolicy(
  "music.song.manage",
  musicFiles("scores"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The score leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.scoreRemoveFailed,
        notFound: ({ m }) => m.songs.actions.scoreNotFound,
      },
      () => removeSongScore(text(formData, "id")),
    );
  },
);

// The PDF files of the song. The PDF functions check the song admin role and the files.

/**
 * The fields of a PDF, image, sound file or link form: `name`, the `keys` and
 * the `arrangementIds` (each checkbox gives one).
 */
function attachmentInput(formData: FormData) {
  return {
    name: text(formData, "name"),
    keys: formData.getAll("keys").filter((value) => typeof value === "string"),
    arrangementIds: formData.getAll("arrangementIds").filter((value) => typeof value === "string"),
  };
}

/**
 * Starts the upload of a PDF file for the song: the browser puts the file to
 * `uploadUrl`, then calls `addPdfAction` with `path`. Call it directly, not
 * with `useActionState`.
 */
export const startPdfUploadAction = withPolicy(
  "music.song.manage",
  musicFiles("pdfs"),
  async (
    _scope,
    songId: string,
  ): Promise<{ status: "success"; path: string; uploadUrl: string } | FormState> => {
    try {
      const upload = await startPdfUpload(typeof songId === "string" ? songId : "");
      if (upload) return { status: "success", ...upload };
      const { m } = await getRequestI18n();
      return { status: "error", message: m.songs.actions.pdfNotFound, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.songs.actions.pdfSaveFailed);
    }
  },
);

/** Adds the uploaded PDF file: `songId`, `path`, `fileName` and the fields of `attachmentInput`. */
export const addPdfAction = withPolicy(
  "music.song.manage",
  musicFiles("pdfs"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.pdfAdded,
        failure: ({ m }) => m.songs.actions.pdfSaveFailed,
        notFound: ({ m }) => m.songs.actions.pdfNotFound,
      },
      () =>
        addSongPdf(text(formData, "songId"), {
          ...attachmentInput(formData),
          path: text(formData, "path"),
          fileName: text(formData, "fileName"),
        }),
    );
  },
);

/** Changes the name, the keys and the arrangements of the PDF file `id`. */
export const updatePdfAction = withPolicy(
  "music.song.manage",
  musicFiles("pdfs"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.pdfSaved,
        failure: ({ m }) => m.songs.actions.pdfSaveFailed,
        notFound: ({ m }) => m.songs.actions.pdfNotFound,
      },
      () => updateSongPdf(text(formData, "id"), attachmentInput(formData)),
    );
  },
);

/** Removes the PDF file `id`, from the confirmation dialog. */
export const removePdfAction = withPolicy(
  "music.song.manage",
  musicFiles("pdfs"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The PDF file leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.pdfRemoveFailed,
        notFound: ({ m }) => m.songs.actions.pdfNotFound,
      },
      () => removeSongPdf(text(formData, "id")),
    );
  },
);

// The images of the song. The image functions check the song admin role and the files.

/**
 * Adds an image without pages: `songId` and the fields of `attachmentInput`.
 * The browser then adds the pages with `addImagePageAction`. Call it
 * directly, not with `useActionState`.
 */
export const addImageAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, formData: FormData): Promise<{ status: "success"; id: string } | FormState> => {
    try {
      const id = await addSongImage(text(formData, "songId"), attachmentInput(formData));
      if (id) return { status: "success", id };
      const { m } = await getRequestI18n();
      return { status: "error", message: m.songs.actions.imageNotFound, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.songs.actions.imageSaveFailed);
    }
  },
);

/**
 * Adds the file `image` as the last page of the image `imageId`. The page
 * does not show the new values: after the last page, also after a failed one,
 * the browser calls `showImagePagesAction` once.
 */
export const addImagePageAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    try {
      if (!(await addSongImagePage(text(formData, "imageId"), file(formData, "image")))) {
        const { m } = await getRequestI18n();
        return { status: "error", message: m.songs.actions.imageNotFound, fieldErrors: {} };
      }
    } catch (error) {
      return errorState(error, ({ m }) => m.songs.actions.imagePageFailed);
    }
    // The form shows the progress of all pages.
    return { status: "success", message: "", fieldErrors: {} };
  },
);

/** Shows the new pages of `addImagePageAction`, after all pages of an upload. */
export const showImagePagesAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope): Promise<void> => {
    refresh();
  },
);

/** Changes the name, the keys and the arrangements of the image `id`. */
export const updateImageAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.imageSaved,
        failure: ({ m }) => m.songs.actions.imageSaveFailed,
        notFound: ({ m }) => m.songs.actions.imageNotFound,
      },
      () => updateSongImage(text(formData, "id"), attachmentInput(formData)),
    );
  },
);

/** Puts the pages of the image `imageId` in the order of the `pageIds` fields. */
export const moveImagePagesAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The pages show in their new order.
        success: () => "",
        failure: ({ m }) => m.songs.actions.imageSaveFailed,
        notFound: ({ m }) => m.songs.actions.imageNotFound,
      },
      () =>
        moveSongImagePages(
          text(formData, "imageId"),
          formData.getAll("pageIds").filter((value) => typeof value === "string"),
        ),
    );
  },
);

/** Removes the image `id` with its pages, from the confirmation dialog. */
export const removeImageAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The image leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.imageRemoveFailed,
        notFound: ({ m }) => m.songs.actions.imageNotFound,
      },
      () => removeSongImage(text(formData, "id")),
    );
  },
);

/** Removes the page `id` of an image, from the confirmation dialog. */
export const removeImagePageAction = withPolicy(
  "music.song.manage",
  musicFiles("images"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The page leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.imagePageRemoveFailed,
        notFound: ({ m }) => m.songs.actions.imageNotFound,
      },
      () => removeSongImagePage(text(formData, "id")),
    );
  },
);

// The sound files of the song. The sound file functions check the song admin role and the files.

/**
 * Starts the upload of a sound file for the song: the browser puts the file
 * to `uploadUrl`, then calls `addSoundFileAction` with `path`. Call it
 * directly, not with `useActionState`.
 */
export const startSoundFileUploadAction = withPolicy(
  "music.song.manage",
  musicFiles("sound-files"),
  async (
    _scope,
    songId: string,
  ): Promise<{ status: "success"; path: string; uploadUrl: string } | FormState> => {
    try {
      const upload = await startSoundFileUpload(typeof songId === "string" ? songId : "");
      if (upload) return { status: "success", ...upload };
      const { m } = await getRequestI18n();
      return { status: "error", message: m.songs.actions.soundFileNotFound, fieldErrors: {} };
    } catch (error) {
      return errorState(error, ({ m }) => m.songs.actions.soundFileSaveFailed);
    }
  },
);

/** Adds the uploaded sound file: `songId`, `path`, `fileName` and the fields of `attachmentInput`. */
export const addSoundFileAction = withPolicy(
  "music.song.manage",
  musicFiles("sound-files"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.soundFileAdded,
        failure: ({ m }) => m.songs.actions.soundFileSaveFailed,
        notFound: ({ m }) => m.songs.actions.soundFileNotFound,
      },
      () =>
        addSongSoundFile(text(formData, "songId"), {
          ...attachmentInput(formData),
          path: text(formData, "path"),
          fileName: text(formData, "fileName"),
        }),
    );
  },
);

/** Changes the name, the keys and the arrangements of the sound file `id`. */
export const updateSoundFileAction = withPolicy(
  "music.song.manage",
  musicFiles("sound-files"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.soundFileSaved,
        failure: ({ m }) => m.songs.actions.soundFileSaveFailed,
        notFound: ({ m }) => m.songs.actions.soundFileNotFound,
      },
      () => updateSongSoundFile(text(formData, "id"), attachmentInput(formData)),
    );
  },
);

/** Removes the sound file `id`, from the confirmation dialog. */
export const removeSoundFileAction = withPolicy(
  "music.song.manage",
  musicFiles("sound-files"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The sound file leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.soundFileRemoveFailed,
        notFound: ({ m }) => m.songs.actions.soundFileNotFound,
      },
      () => removeSongSoundFile(text(formData, "id")),
    );
  },
);

// The links of the song. The link functions check the song admin role and the URL.

/** Adds a link to the song `songId`: `url` and the fields of `attachmentInput`. */
export const addLinkAction = withPolicy(
  "music.song.manage",
  musicFiles("links"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.linkAdded,
        failure: ({ m }) => m.songs.actions.linkSaveFailed,
        notFound: ({ m }) => m.songs.actions.linkNotFound,
      },
      () =>
        addSongLink(text(formData, "songId"), {
          ...attachmentInput(formData),
          url: text(formData, "url"),
        }),
    );
  },
);

/** Changes the name, the URL, the keys and the arrangements of the link `id`. */
export const updateLinkAction = withPolicy(
  "music.song.manage",
  musicFiles("links"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        success: ({ m }) => m.songs.actions.linkSaved,
        failure: ({ m }) => m.songs.actions.linkSaveFailed,
        notFound: ({ m }) => m.songs.actions.linkNotFound,
      },
      () =>
        updateSongLink(text(formData, "id"), {
          ...attachmentInput(formData),
          url: text(formData, "url"),
        }),
    );
  },
);

/** Removes the link `id`, from the confirmation dialog. */
export const removeLinkAction = withPolicy(
  "music.song.manage",
  musicFiles("links"),
  async (_scope, _previous: FormState, formData: FormData): Promise<FormState> => {
    return runUpdate(
      {
        // The link leaves the list, so the success needs no message.
        success: () => "",
        failure: ({ m }) => m.songs.actions.linkRemoveFailed,
        notFound: ({ m }) => m.songs.actions.linkNotFound,
      },
      () => removeSongLink(text(formData, "id")),
    );
  },
);

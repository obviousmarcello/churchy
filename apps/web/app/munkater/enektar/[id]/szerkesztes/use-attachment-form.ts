"use client";

import { useState } from "react";

import { invalidatePageCache } from "@/components/music/page-cache";
import { usePageSaveForm } from "@/components/music/page-save";
import { changedPages } from "@/lib/music/page-keys";
import type { FormState } from "@/server/music/form-state";

const initialState: FormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * Sends a form of the edit page of a song with `run`, when the save button of
 * the page saves (see `usePageSaveForm`). Before it, the copies of the pages
 * that show songs are deleted. A failed request shows `connectionFailed`.
 * `onSuccess` gets the form, e.g. to make it empty again. `check` refuses the
 * values before the page saves any form, e.g. a file that is too large.
 */
export function useAttachmentForm(
  formRef: React.RefObject<HTMLFormElement | null>,
  run: (formData: FormData) => Promise<FormState>,
  {
    connectionFailed,
    onSuccess,
    check,
  }: {
    connectionFailed: string;
    onSuccess?: (form: HTMLFormElement) => void;
    check?: (formData: FormData) => FormState | null;
  },
) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);

  async function save(form: HTMLFormElement): Promise<boolean> {
    const formData = new FormData(form);
    const refused = check?.(formData);
    if (refused) {
      setState(refused);
      return false;
    }
    setPending(true);
    invalidatePageCache(changedPages.songs());
    let result: FormState;
    try {
      result = await run(formData);
    } catch {
      // The request failed, e.g. without a connection.
      result = { status: "error", message: connectionFailed, fieldErrors: {} };
    }
    setPending(false);
    setState(result);
    if (result.status === "success") onSuccess?.(form);
    return result.status === "success";
  }

  // `check` runs before the page saves any form: a refused value saves nothing.
  function validate(form: HTMLFormElement): boolean {
    const refused = check?.(new FormData(form));
    if (refused) setState(refused);
    return !refused;
  }

  const { onSubmit } = usePageSaveForm({ formRef, save, validate });
  return { state, pending, onSubmit };
}

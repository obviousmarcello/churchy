"use client";

import { useState } from "react";
import { Button, SaveIcon, SaveStatus, ToastProvider, useToast, type SaveState } from "@churchy/ui";

export interface SaveDemoLabels {
  toastRegion: string;
  toastClose: string;
  toastSaved: string;
  toastSavedBody: string;
  saveInline: string;
  saveToast: string;
  saving: string;
  saved: string;
  saveError: string;
}

function Buttons({ labels }: { labels: SaveDemoLabels }) {
  const toast = useToast();
  const [state, setState] = useState<SaveState>("idle");
  const saveInline = () => {
    setState("saving");
    // Simulated round trip; a real form sets the state from its server action result.
    setTimeout(() => setState("saved"), 400);
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        iconStart={<SaveIcon />}
        loading={state === "saving"}
        onClick={saveInline}
        data-testid="showcase-save-inline"
      >
        {labels.saveInline}
      </Button>
      <SaveStatus
        state={state}
        messages={{ saving: labels.saving, saved: labels.saved, error: labels.saveError }}
        data-testid="showcase-save-status"
      />
      <Button
        variant="secondary"
        onClick={() => toast.show({ title: labels.toastSaved, description: labels.toastSavedBody })}
        data-testid="showcase-save-toast"
      >
        {labels.saveToast}
      </Button>
    </div>
  );
}

/** Showcase of the two save confirmations: inline `SaveStatus` and a toast. */
export function SaveDemo({ labels }: { labels: SaveDemoLabels }) {
  return (
    <ToastProvider regionLabel={labels.toastRegion} closeLabel={labels.toastClose}>
      <Buttons labels={labels} />
    </ToastProvider>
  );
}

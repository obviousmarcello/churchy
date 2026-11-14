"use client";

import { useState } from "react";
import { Button } from "./button";

export interface EmbedFacadeProps {
  /** Player URL from `embedSource()` (never a raw stored URL). */
  src: string;
  /** Accessible name of the frame once loaded. */
  frameTitle: string;
  /** Privacy notice shown before loading (which provider will receive a request). */
  notice: string;
  /** Label of the load button. */
  loadLabel: string;
}

/**
 * Click-to-load video embed (C-04, SDD §14). Until the visitor clicks, only a self-drawn
 * placeholder is shown: no frame, script, image or font is requested from the provider. The choice
 * is not remembered, so every visit starts without a third-party request.
 */
export function EmbedFacade({ src, frameTitle, notice, loadLabel }: EmbedFacadeProps) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <div className="overflow-hidden rounded-md border-2 border-border" data-testid="embed-frame">
        <iframe
          title={frameTitle}
          src={src}
          className="block aspect-video w-full border-0"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md border-2 border-border bg-surface-sunken"
      data-testid="embed-facade"
    >
      <div className="flex aspect-video w-full items-center justify-center text-border-strong">
        <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true" focusable="false">
          <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="4" />
          <path d="M26 20 L46 32 L26 44 Z" fill="currentColor" />
        </svg>
      </div>
      <div className="grid gap-3 border-t-2 border-border bg-surface-raised p-4 sm:flex sm:items-center sm:justify-between">
        <p className="text-fs-2 text-text">{notice}</p>
        <Button
          variant="primary"
          className="shrink-0"
          onClick={() => setLoaded(true)}
          data-testid="embed-load"
        >
          {loadLabel}
        </Button>
      </div>
    </div>
  );
}

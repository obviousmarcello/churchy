"use client";

import { useState } from "react";
import type { GeoPoint } from "@churchy/contracts";
import { Button } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { osmEmbedUrl } from "@/lib/locations";

/**
 * Click-to-load map (C-04, SDD §14, D-12 AC4). Until the visitor clicks, the page shows a static,
 * self-drawn placeholder: no tile, script, font or frame from a third party is requested. Only the
 * click puts the OpenStreetMap embed on the page. The choice is not remembered, so every visit
 * starts without any third-party request.
 */
export function MapFacade({ name, geo }: { name: string; geo: GeoPoint }) {
  const t = useT("public.map");
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <div className="overflow-hidden rounded-md border-2 border-border" data-testid="map-embed">
        <iframe
          title={t("frameTitle", { name })}
          src={osmEmbedUrl(geo)}
          className="block aspect-[4/3] w-full border-0 sm:aspect-video"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-md border-2 border-border bg-surface-sunken"
      data-testid="map-facade"
    >
      <svg
        viewBox="0 0 400 225"
        preserveAspectRatio="xMidYMid slice"
        className="block aspect-[16/7] w-full text-border-strong"
        role="img"
        aria-label={t("placeholderLabel", { name })}
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" opacity="0.55">
          <path d="M-10 160 C 80 130, 150 170, 230 120 S 360 60, 420 80" strokeWidth="14" />
          <path d="M60 -10 L 120 240" strokeWidth="8" />
          <path d="M260 -10 C 250 60, 300 140, 280 240" strokeWidth="8" />
          <path d="M-10 60 L 420 30" strokeWidth="5" />
          <path d="M-10 205 L 420 190" strokeWidth="5" />
          <path d="M170 -10 L 200 240" strokeWidth="4" />
          <path d="M340 -10 L 360 240" strokeWidth="4" />
        </g>
        <g transform="translate(200 104)">
          <path
            d="M0 26 C -4 14, -18 6, -18 -8 A 18 18 0 1 1 18 -8 C 18 6, 4 14, 0 26 Z"
            className="fill-primary"
          />
          <circle r="7" cy="-8" className="fill-surface-raised" />
        </g>
      </svg>
      <div className="grid gap-3 border-t-2 border-border bg-surface-raised p-4 sm:flex sm:items-center sm:justify-between">
        <p className="text-fs-2 text-text">{t("notice")}</p>
        <Button
          variant="primary"
          className="shrink-0"
          onClick={() => setLoaded(true)}
          data-testid="map-load"
        >
          {t("load")}
        </Button>
      </div>
    </div>
  );
}

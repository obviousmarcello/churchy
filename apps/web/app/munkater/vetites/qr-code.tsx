"use client";

import { useMemo } from "react";
import { renderSVG } from "uqr";

/** A QR code of `text`, as an image. Black on white, so phones read it also on a dark screen. */
export function QrCode({
  text,
  label,
  className,
  style,
}: {
  text: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(text, { border: 2 }))}`,
    [text],
  );
  // eslint-disable-next-line @next/next/no-img-element -- A data URL: there is nothing to optimize.
  return <img src={src} alt={label} className={className} style={style} />;
}

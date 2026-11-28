"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";

export interface AnimatedNumberProps {
  value: number;
  /** Fraction digits (default 0). Grouping follows hu-HU (`12 345`). */
  digits?: number;
  /** Tween length in ms (default 480, `--dur-4`). */
  duration?: number;
  className?: string;
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A number that counts to its new value when it changes (counters, totals, dashboard tiles). The
 * first render shows the final value (no count-up on page load, no layout shift: tabular figures);
 * assistive technology only ever gets the final value. Instant under reduced motion.
 */
export function AnimatedNumber({
  value,
  digits = 0,
  duration = 480,
  className,
}: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    if (reducedMotion() || duration <= 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(from + (value - from) * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const format = new Intl.NumberFormat("hu-HU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden="true">{format.format(shown)}</span>
      <span className="sr-only">{format.format(value)}</span>
    </span>
  );
}

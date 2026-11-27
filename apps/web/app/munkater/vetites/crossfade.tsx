"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/music/utils";

/**
 * Shows the new child over the old one, which fades out in `ms`. At once for
 * 0 ms (a cut) and with "reduce motion".
 */
export function Crossfade({
  id,
  ms,
  children,
}: {
  id: string;
  ms: number;
  children: React.ReactNode;
}) {
  // `id` changes with the content, so the node of an id stays the same.
  const [current, setCurrent] = useState({ id, node: children });
  const [leaving, setLeaving] = useState<{ id: string; node: React.ReactNode }[]>([]);
  if (id !== current.id) {
    setLeaving(ms > 0 ? [...leaving.filter((layer) => layer.id !== id), current] : []);
    setCurrent({ id, node: children });
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), ms + 50);
    return () => clearTimeout(timer);
  }, [leaving, ms]);

  const duration = { animationDuration: `${ms}ms` };
  return (
    <div className="absolute inset-0">
      {leaving.map((layer) => (
        <div
          key={layer.id}
          aria-hidden
          style={duration}
          className="absolute inset-0 animate-out fade-out fill-mode-forwards motion-reduce:hidden"
        >
          {layer.node}
        </div>
      ))}
      <div
        key={current.id}
        style={ms > 0 ? duration : undefined}
        className={cn(
          "absolute inset-0",
          ms > 0 && "animate-in fade-in motion-reduce:animate-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}

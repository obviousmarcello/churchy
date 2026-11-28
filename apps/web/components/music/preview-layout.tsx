"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/music/utils";

// The content of a part of a page, e.g. a list of files, with a preview of it.
// The content keeps its width (at most 48rem). The preview uses the room next
// to it when the nearest `@container` has room for both, or goes under it.

/**
 * With `lazy`, the preview shows only when it comes near the window, e.g. a
 * PDF far down a long page: before that, it downloads and draws nothing.
 */
export function PreviewLayout({
  preview,
  lazy = false,
  children,
}: {
  preview?: React.ReactNode;
  lazy?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!lazy);

  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    // One window height before the preview comes into view.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div
      className={cn(
        "grid gap-8",
        Boolean(preview) && "@5xl:grid-cols-[minmax(0,48rem)_minmax(22rem,1fr)]",
      )}
    >
      <div className="@container flex max-w-3xl min-w-0 flex-col gap-8">{children}</div>
      {preview && (
        // The preview stays in view while the user scrolls the content.
        <div
          ref={ref}
          className="max-w-3xl min-w-0 @5xl:sticky @5xl:top-32 @5xl:max-h-[calc(100dvh-9rem)] @5xl:self-start @5xl:overflow-y-auto"
        >
          {near ? preview : <div aria-hidden className="min-h-48" />}
        </div>
      )}
    </div>
  );
}

/** The title of the preview, a short hint next to it, e.g. the name of the file it shows, and the preview. */
export function PreviewSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-sm font-medium">
          {title}
        </h3>
        {hint && <p className="min-w-0 text-right text-xs break-words text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** The explicit empty state of a preview. */
export function PreviewEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card border border-dashed px-4 py-6 text-center [&>svg]:mb-1 [&>svg]:size-5 [&>svg]:text-muted">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

/** The box of a preview of pages, e.g. of a PDF file. It scrolls when the pages are longer than the window. */
export function PreviewPages({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "max-h-[calc(100dvh-12rem)] overflow-y-auto rounded-card border bg-surface-sunken/40 p-3",
        className,
      )}
      {...props}
    />
  );
}

/** The part of a row of a list that shows its item in the preview, e.g. the name of a file. */
export const previewButtonClass =
  "-mx-1 flex min-w-0 flex-1 cursor-pointer rounded-control px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-focus/50";

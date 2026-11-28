"use client";

import { useEffect, useRef } from "react";
import { CameraIcon, ImagePlusIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useMediaQuery } from "@/lib/music/browser";

// The parts that the choosers of sheet pages share: the pages of a song image
// (`songs/[id]/edit/song-images.tsx`) and the photos to read a chart from
// (`songs/read-chart-dialog.tsx`).

/** The box that shows when no pages are chosen. A click opens the file picker. */
export const PAGES_BOX =
  "flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed bg-surface-raised px-4 py-5 text-center transition-colors outline-none hover:bg-surface-sunken focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50";

/**
 * Object URLs of files on this device, e.g. for thumbnails. `free` frees one
 * URL. The others are freed when the component unmounts.
 */
export function useObjectUrls() {
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const all = urls.current;
    return () => {
      for (const url of all) URL.revokeObjectURL(url);
    };
  }, []);

  return {
    create(blob: Blob): string {
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      return url;
    },
    free(url: string) {
      URL.revokeObjectURL(url);
      urls.current.delete(url);
    },
  };
}

/**
 * Chooses images on this device: from files, or on a phone or a tablet with
 * the camera. Each photo adds one image. Render `inputs` in the chooser, and
 * `ImageChooserButtons` or a button that calls `openFiles`.
 */
export function useImageChooser(onAdd: (files: File[]) => void) {
  const filesRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // A phone or a tablet: the camera button opens the camera at once.
  const touch = useMediaQuery("(pointer: coarse)");

  function add(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.currentTarget.files ?? [])].filter((file) => file.size > 0);
    // The same file can be chosen again.
    event.currentTarget.value = "";
    onAdd(files);
  }

  return {
    touch,
    openFiles: () => filesRef.current?.click(),
    openCamera: () => cameraRef.current?.click(),
    inputs: (
      <>
        <input ref={filesRef} type="file" accept="image/*" multiple hidden onChange={add} />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={add}
        />
      </>
    ),
  };
}

/** The buttons of `useImageChooser`: the camera on a phone or a tablet only, then the files. */
export function ImageChooserButtons({
  chooser,
  labels,
  disabled = false,
}: {
  chooser: ReturnType<typeof useImageChooser>;
  labels: { takePhoto: string; choose: string };
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {chooser.touch && (
        <Button type="button" variant="outline" disabled={disabled} onClick={chooser.openCamera}>
          <CameraIcon />
          {labels.takePhoto}
        </Button>
      )}
      <Button type="button" variant="outline" disabled={disabled} onClick={chooser.openFiles}>
        <ImagePlusIcon />
        {labels.choose}
      </Button>
    </div>
  );
}

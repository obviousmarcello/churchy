"use client";

import { createContext, use, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { FileUpIcon } from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { uploadTypeOf } from "@/lib/music/sound-files";
import { cn } from "@/lib/music/utils";

/** The kinds of files that a part of a page can take. */
export type FileKind = "image" | "pdf" | "score" | "sound" | "pptx";

const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

// MuseScore exports `.mxl` (compressed) and `.musicxml`; older programs write `.xml`.
const SCORE_TYPES = [
  "application/vnd.recordare.musicxml",
  "application/vnd.recordare.musicxml+xml",
  "application/xml",
  "text/xml",
];

/** The classes of a drop box or a field while the dragged files go to it. */
export const DROP_SELECTED = "border-focus bg-surface-sunken ring-3 ring-focus/50";

/**
 * After this time without a `dragover` event, the drag has ended (e.g. with
 * Escape, or outside the window). A browser sends `dragover` about every
 * 350 ms (at most 550 ms) while the pointer stays still.
 */
const DRAG_END_DELAY = 1000;

/**
 * True while the user drags something of this page, e.g. a page image. The
 * browser can give such a drag a file too, but it is not a file to add.
 */
let dragFromPage = false;

function kindOfType(type: string): FileKind | null {
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "pdf";
  if (type === PPTX_TYPE) return "pptx";
  if (SCORE_TYPES.includes(type)) return "score";
  if (type.startsWith("audio/")) return "sound";
  return null;
}

/** The kind of a file, from its extension or its type. Null for a file that no part takes. */
export function fileKind(file: File): FileKind | null {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "pptx") return "pptx";
  if (extension === "mxl" || extension === "musicxml" || extension === "xml") return "score";
  // Also an MP4 or WebM file, which has the type of a video.
  if (uploadTypeOf(file)) return "sound";
  return kindOfType(file.type);
}

function hasFiles(event: DragEvent | React.DragEvent) {
  return !dragFromPage && (event.dataTransfer?.types.includes("Files") ?? false);
}

/** The files of a drop that have one of `kinds`. Empty files are left out. */
function filesOf(dataTransfer: DataTransfer, kinds: readonly FileKind[]): File[] {
  return [...dataTransfer.files].filter((file) => {
    const kind = fileKind(file);
    return file.size > 0 && kind !== null && kinds.includes(kind);
  });
}

/** A part of the page that takes dropped files (see `useFileDropTarget`). */
export type FileDropTarget = {
  id: string;
  /** The text of its option while files are dragged over the page. */
  label: string;
  kinds: readonly FileKind[];
  /** The part that a file of one of `kinds` goes to first. Without one, the first part on the page. */
  primary?: boolean;
  /** The part on the page: the page scrolls to it after the drop. */
  element: React.RefObject<HTMLElement | null>;
  onFiles: (files: File[]) => void;
};

/**
 * While files are dragged over the page: the parts that take them and the
 * selected part. `inZone`: over a drop box or a file field, which takes the
 * drop itself.
 */
type Drag = {
  options: { id: string; label: string }[];
  selected: string | null;
  inZone: boolean;
};

type Registry = {
  drag: Drag | null;
  register: (id: string, target: () => FileDropTarget | null) => () => void;
};

const FileDropContext = createContext<Registry | null>(null);

/** The parts that take a file of one of `kinds` (all parts for null), in their order on the page. */
function targetsFor(targets: FileDropTarget[], kinds: FileKind[] | null) {
  return targets
    .filter((target) => kinds === null || target.kinds.some((kind) => kinds.includes(kind)))
    .sort((a, b) => {
      if (!a.element.current || !b.element.current) return 0;
      return a.element.current.compareDocumentPosition(b.element.current) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });
}

function defaultTarget(targets: FileDropTarget[], kind: FileKind | null) {
  if (kind === null) return undefined;
  const all = targets.filter((target) => target.kinds.includes(kind));
  return all.find((target) => target.primary) ?? all[0];
}

function isFileInput(target: EventTarget | null) {
  return target instanceof HTMLInputElement && target.type === "file";
}

function dialogOpen() {
  return document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;
}

/**
 * Files dropped anywhere on the page go to a part of the page that registered
 * with `useFileDropTarget`. While files are dragged, a panel shows the parts
 * that take them: the part for the kind of the first file is selected, and a
 * drag over another option selects it. A drop box of a part (`useDropZone`)
 * and a file field take their own drops. With an open dialog, the page takes
 * no drops.
 */
export function FileDropArea({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const t = m.components.fileDrop;
  const targets = useRef(new Map<string, () => FileDropTarget | null>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const register = useMemo<Registry["register"]>(
    () => (id, target) => {
      targets.current.set(id, target);
      return () => {
        targets.current.delete(id);
      };
    },
    [],
  );
  const registry = useMemo(() => ({ drag, register }), [drag, register]);

  function update(next: Drag | null) {
    const current = dragRef.current;
    const same =
      current === next ||
      (current !== null &&
        next !== null &&
        current.options === next.options &&
        current.selected === next.selected &&
        current.inZone === next.inZone);
    if (same) return;
    dragRef.current = next;
    setDrag(next);
  }

  function all() {
    return [...targets.current.values()]
      .map((target) => target())
      .filter((target) => target !== null);
  }

  const onDragOver = useEffectEvent((event: DragEvent) => {
    // A drop box takes the drop, or the browser puts the file in a file field.
    const inZone = event.defaultPrevented || isFileInput(event.target);
    // Without this, the browser opens the file instead of the page.
    if (!inZone) event.preventDefault();
    if (dialogOpen()) {
      update(null);
      if (!inZone && event.dataTransfer) event.dataTransfer.dropEffect = "none";
      return;
    }
    let next = dragRef.current;
    if (!next) {
      const found = [...(event.dataTransfer?.items ?? [])]
        .filter((item) => item.kind === "file")
        .map((item) => kindOfType(item.type));
      // The browser can leave out the types of the files while they are dragged (e.g. for `.mxl`).
      const kinds = found.includes(null) ? null : [...new Set(found as FileKind[])];
      const options = targetsFor(all(), kinds);
      next = {
        options: options.map(({ id, label }) => ({ id, label })),
        selected: defaultTarget(options, found[0] ?? null)?.id ?? null,
        inZone,
      };
    }
    if (!inZone && event.dataTransfer)
      event.dataTransfer.dropEffect = next.options.length > 0 ? "copy" : "none";
    update({ ...next, inZone });
  });

  const onDrop = useEffectEvent((event: DragEvent) => {
    const selected = dragRef.current?.selected ?? null;
    update(null);
    if (event.defaultPrevented || isFileInput(event.target) || !event.dataTransfer) return;
    event.preventDefault();
    if (dialogOpen()) return;

    const files = [...event.dataTransfer.files];
    const kind = files.map(fileKind).find((found) => found !== null) ?? null;
    const options = targetsFor(all(), null);
    const chosen = options.find((target) => target.id === selected);
    const target =
      chosen && kind && chosen.kinds.includes(kind) ? chosen : defaultTarget(options, kind);
    if (!target) return;
    const accepted = filesOf(event.dataTransfer, target.kinds);
    if (accepted.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.element.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
    target.onFiles(accepted);
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function over(event: DragEvent) {
      if (!hasFiles(event)) return;
      onDragOver(event);
      clearTimeout(timer);
      timer = setTimeout(() => {
        dragRef.current = null;
        setDrag(null);
      }, DRAG_END_DELAY);
    }
    function drop(event: DragEvent) {
      if (!hasFiles(event)) return;
      clearTimeout(timer);
      onDrop(event);
    }
    function start() {
      dragFromPage = true;
    }
    function end() {
      dragFromPage = false;
    }
    window.addEventListener("dragstart", start, true);
    window.addEventListener("dragend", end, true);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      clearTimeout(timer);
      dragFromPage = false;
      window.removeEventListener("dragstart", start, true);
      window.removeEventListener("dragend", end, true);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <FileDropContext value={registry}>
      {children}
      {drag && !drag.inZone && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(max(var(--tab-bar-height,0px),env(safe-area-inset-bottom,0px))+1rem)] z-50 mx-auto flex max-w-md flex-col gap-3 rounded-xl border bg-surface-raised p-4 text-text shadow-lg"
        >
          <div className="flex items-start gap-3">
            <FileUpIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium">{drag.options.length > 0 ? t.title : t.none}</p>
              {drag.options.length > 0 && <p className="text-sm text-muted">{t.hint}</p>}
            </div>
          </div>
          {drag.options.length > 0 && (
            <ul className="flex flex-col gap-2">
              {drag.options.map((option) => (
                <li
                  key={option.id}
                  onDragEnter={() =>
                    dragRef.current && update({ ...dragRef.current, selected: option.id })
                  }
                  aria-current={drag.selected === option.id || undefined}
                  className={cn(
                    "rounded-lg border border-dashed bg-border-strong-background px-3 py-3 text-sm transition-colors",
                    drag.selected === option.id && cn(DROP_SELECTED, "border-solid font-medium"),
                  )}
                >
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FileDropContext>
  );
}

/**
 * Makes a part of the page take the files that are dropped on the page (see
 * `FileDropArea`). Null: the part takes no files now, e.g. during an upload.
 * `selected` is true while dragged files go to this part. Without a
 * `FileDropArea`, it does nothing.
 */
export function useFileDropTarget(target: FileDropTarget | null): { selected: boolean } {
  const registry = use(FileDropContext);
  const register = registry?.register;
  const latest = useRef(target);
  const id = target?.id ?? null;

  useEffect(() => {
    latest.current = target;
  });

  useEffect(() => {
    if (!register || id === null) return;
    return register(id, () => latest.current);
  }, [register, id]);

  const drag = registry?.drag;
  return { selected: id !== null && !!drag && !drag.inZone && drag.selected === id };
}

/**
 * A drop box: it takes the dropped files of one of `kinds`. `over` is true
 * while files are dragged over it. A disabled box takes the drop, but not
 * the files, so that they do not go to another part of the page.
 */
export function useDropZone({
  kinds,
  disabled = false,
  onFiles,
}: {
  kinds: readonly FileKind[];
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    over: over && !disabled,
    props: {
      onDragOver(event: React.DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        setOver(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOver(false), DRAG_END_DELAY);
      },
      onDrop(event: React.DragEvent) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        clearTimeout(timer.current);
        setOver(false);
        if (disabled) return;
        const files = filesOf(event.dataTransfer, kinds);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}

/** Puts `file` in a file field, as if the user chose it. */
export function setInputFile(input: HTMLInputElement | null, file: File) {
  if (!input) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus({ preventScroll: true });
}

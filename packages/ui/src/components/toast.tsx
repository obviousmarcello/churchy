"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../cn";
import { CloseIcon, DangerIcon, InfoIcon, SuccessIcon, WarningIcon } from "../icons";

export type ToastTone = "success" | "info" | "warning" | "danger";

const toneStyle: Record<ToastTone, { icon: typeof InfoIcon; className: string; tile: string }> = {
  success: { icon: SuccessIcon, className: "text-success", tile: "bg-success-soft" },
  info: { icon: InfoIcon, className: "text-info", tile: "bg-info-soft" },
  warning: { icon: WarningIcon, className: "text-warning", tile: "bg-warning-soft" },
  danger: { icon: DangerIcon, className: "text-danger", tile: "bg-danger-soft" },
};

export interface ToastProps {
  tone?: ToastTone;
  /** Short confirmation that names the action: "A hirdetés mentve." */
  title: string;
  description?: ReactNode;
  /** Accessible name of the dismiss button; omit to render no dismiss button. */
  closeLabel?: string;
  onDismiss?: () => void;
  className?: string;
}

/** One toast. Presentational: use `useToast()` to show toasts after an action. */
export function Toast({
  tone = "success",
  title,
  description,
  closeLabel,
  onDismiss,
  className,
}: ToastProps) {
  const { icon: Icon, className: toneClass } = toneStyle[tone];
  return (
    <div
      data-tone={tone}
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-card border border-hairline bg-surface-raised py-3 pr-2 pl-3 text-text shadow-overlay",
        "motion-safe:animate-[ui-toast-in_var(--dur-3)_var(--ease-spring)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("grid size-9 shrink-0 place-items-center rounded-tile", toneStyle[tone].tile)}
      >
        <Icon className={cn("size-5", toneClass)} />
      </span>
      <div className="min-w-0 flex-1 py-1">
        <p className="font-semibold">{title}</p>
        {description ? <div className="mt-0.5 text-fs-2 text-muted">{description}</div> : null}
      </div>
      {closeLabel && onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={closeLabel}
          className="-my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-(--dur-2) hover:bg-hover hover:text-text"
        >
          <CloseIcon size="sm" />
        </button>
      ) : null}
    </div>
  );
}

export interface ToastOptions {
  tone?: ToastTone;
  title: string;
  description?: ReactNode;
  /** Milliseconds before it disappears; default 5000. Errors stay until dismissed (0). */
  duration?: number;
}

interface ToastEntry extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** `const toast = useToast(); toast.show({ title: t("saved") })`. Needs a `ToastProvider`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() needs a <ToastProvider> above it");
  return api;
}

export interface ToastProviderProps {
  /** Accessible name of the toast region ("Értesítések"). */
  regionLabel: string;
  /** Accessible name of each dismiss button ("Értesítés bezárása"). */
  closeLabel: string;
  children: ReactNode;
}

/**
 * Hosts toasts at the bottom of the viewport (centred on phones, bottom-right from 40rem). The
 * region is a polite live region that exists from the first render, so new toasts are announced.
 * At most three are shown; the oldest goes first.
 */
export function ToastProvider({ regionLabel, closeLabel, children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { ...options, id }].slice(-3));
      const duration = options.duration ?? (options.tone === "danger" ? 0 : 5000);
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        aria-label={regionLabel}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      >
        {toasts.map((t) => (
          <div key={t.id} role="status" className="w-full max-w-sm">
            <Toast
              tone={t.tone}
              title={t.title}
              description={t.description}
              closeLabel={closeLabel}
              onDismiss={() => dismiss(t.id)}
            />
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

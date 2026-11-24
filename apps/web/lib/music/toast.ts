import { Toast } from "@base-ui/react/toast";

import { haptic, HAPTIC_MS } from "./haptics";

// The toasts: short messages at the bottom of the screen that close
// themselves, e.g. "Profile saved". One manager for the whole app, so code
// outside React (e.g. the update of the service worker) can show a toast too.
// `<Toaster />` (`src/components/ui/toast.tsx`) shows them.

export const toastManager = Toast.createToastManager();

export type ToastType = "success" | "error" | "info";

/** The result of an action went well. */
export function toastSuccess(title: string, options: { id?: string } = {}): string {
  haptic(HAPTIC_MS.success);
  return toastManager.add({ ...options, title, type: "success" });
}

/** The result of an action failed. Screen readers announce it at once. */
export function toastError(title: string, options: { id?: string } = {}): string {
  haptic(HAPTIC_MS.error);
  return toastManager.add({ ...options, title, type: "error", priority: "high" });
}

/** A message that is not a result, with an optional button, e.g. "New version" with "Reload". */
export function toastInfo(
  title: string,
  options: {
    id?: string;
    description?: string;
    timeout?: number;
    action?: { label: string; onClick: () => void };
  } = {},
): string {
  const { action, ...rest } = options;
  return toastManager.add({
    ...rest,
    title,
    type: "info",
    actionProps: action && { children: action.label, onClick: action.onClick },
  });
}

type ResultState = { status: "idle" | "success" | "error"; message: string | null };

/**
 * Calls `notify` once for each success state with a message. A form can show
 * the same state object again, e.g. when it mounts again or when a dialog
 * closes, so the states that were shown are kept (weakly, by identity).
 */
export function createResultNotifier(
  notify: (message: string) => void,
): (state: ResultState) => void {
  const shown = new WeakSet<ResultState>();
  return (state) => {
    if (state.status !== "success" || !state.message || shown.has(state)) return;
    shown.add(state);
    notify(state.message);
  };
}

/** Shows the message of a form result as a toast, once. See `useResultToast()`. */
export const toastResult = createResultNotifier((message) => toastSuccess(message));

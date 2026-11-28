"use client";

import { Toast } from "@base-ui/react/toast";
import { CircleCheckIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { toastManager } from "@/lib/music/toast";
import { cn } from "@/lib/music/utils";

// The toasts of `@/lib/toast`, in a stack at the bottom of the screen. See
// node_modules/@base-ui/react/docs/react/components/toast.md.
//
// On phones the stack is in the middle, above the tab bar
// (`--tab-bar-height`) or the home indicator. On large screens it is at the
// bottom right. A swipe down or to the right closes a toast.

/** Shows the toasts. Once, in the root layout. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="fixed inset-x-4 bottom-[calc(max(var(--tab-bar-height,0px),env(safe-area-inset-bottom,0px))+0.75rem+var(--offline-bar-height,0px))] z-50 mx-auto w-auto max-w-sm outline-none lg:right-6 lg:bottom-[calc(1.5rem+var(--offline-bar-height,0px))] lg:left-auto lg:mx-0 lg:w-sm">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  const { m } = useI18n();

  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      swipeDirection={["down", "right"]}
      className={cn(
        // The stack: the newest toast is in front, the others peek out above it and are a little smaller.
        "[--gap:0.75rem] [--peek:0.5rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
        "absolute right-0 bottom-0 left-0 z-[calc(1000-var(--toast-index))] h-[var(--height)] origin-bottom select-none",
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
        "rounded-card border bg-surface-raised text-text shadow-lg",
        "[transition:transform_0.45s_cubic-bezier(0.22,1,0.36,1),opacity_0.45s,height_0.15s] motion-reduce:[transition:opacity_0.2s]",
        // A strip below each toast, so the stack stays open while the pointer moves between toasts.
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "data-expanded:h-[var(--toast-height)] data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "data-limited:opacity-0 data-starting-style:[transform:translateY(150%)] data-ending-style:opacity-0",
        "[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
      )}
    >
      <Toast.Content className="flex h-full items-center gap-3 overflow-hidden py-2.5 pr-2 pl-3.5 transition-opacity duration-200 data-behind:opacity-0 data-expanded:opacity-100">
        {toast.type === "success" && (
          <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-success" />
        )}
        {toast.type === "error" && (
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-danger" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title className="text-sm font-medium" />
          <Toast.Description className="text-sm text-muted empty:hidden" />
        </div>
        {toast.actionProps && <Toast.Action render={<Button variant="secondary" size="sm" />} />}
        <Toast.Close
          aria-label={m.common.actions.close}
          render={<Button variant="ghost" size="icon-sm" className="text-muted" />}
        >
          <XIcon />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

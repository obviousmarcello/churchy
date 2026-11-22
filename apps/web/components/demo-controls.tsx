"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckIcon, ChevronDownIcon, RefreshIcon, UserIcon, buttonClasses, cn } from "@churchy/ui";
import { resetDemo, switchContext, switchPersona, type ResetResult } from "@/server/demo-actions";

export interface DemoOption {
  value: string;
  label: string;
}

interface Choice {
  value: string;
  options: DemoOption[];
}

export interface DemoControlsProps {
  persona: Choice;
  context: Choice;
  labels: {
    menu: string;
    note: string;
    persona: string;
    context: string;
    choosePersona: string;
    chooseContext: string;
    current: string;
    reset: string;
    resetHint: string;
    resetDone: string;
    resetFailed: string;
  };
}

/**
 * One group of options inside the menu: a form with one submit button per option, so a switch is
 * two clicks in all (open the menu, pick) and works without JavaScript.
 */
function OptionGroup({
  name,
  legend,
  choice,
  currentText,
  action,
  onPick,
  testId,
  columns,
}: {
  name: string;
  legend: string;
  choice: Choice;
  currentText: string;
  action: (formData: FormData) => Promise<void>;
  onPick: () => void;
  testId: string;
  columns: string;
}) {
  return (
    <form action={action} onSubmit={onPick} data-testid={testId}>
      <fieldset>
        <legend className="mb-2 text-fs-2 font-semibold text-muted">{legend}</legend>
        <ul className={cn("grid list-none gap-1 p-0", columns)}>
          {choice.options.map((option) => {
            const selected = option.value === choice.value;
            return (
              <li key={option.value} className="flex">
                <button
                  type="submit"
                  name={name}
                  value={option.value}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-[12px] px-3 py-1.5 text-left text-fs-2 leading-snug text-text",
                    "transition-[background-color,scale] duration-(--dur-2) ease-spring hover:bg-hover active:scale-(--motion-press)",
                    selected && "bg-selected font-semibold text-primary",
                  )}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {selected ? <CheckIcon size="sm" className="shrink-0" /> : null}
                  {selected && <span className="sr-only"> {currentText}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </form>
  );
}

/**
 * The demo menu (client part of the demo bar): a disclosure whose button shows the current role and
 * church; the panel holds both switchers and *Visszaállítás*. Escape or a click outside closes it.
 */
export function DemoControls({ persona, context, labels }: DemoControlsProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [reset, resetAction, resetting] = useActionState<ResetResult, FormData>(
    (previous) => resetDemo(previous),
    { status: "idle", count: 0 },
  );
  const currentPersona = persona.options.find((o) => o.value === persona.value)?.label;
  const currentContext = context.options.find((o) => o.value === context.value)?.label;

  /** After a pick: close the menu and keep focus on its button (the option is hidden now). */
  const close = () => {
    ref.current?.removeAttribute("open");
    ref.current?.querySelector("summary")?.focus();
  };

  // A switch re-renders with the new selection: close the menu.
  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [persona.value, context.value]);

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const onPointerDown = (event: PointerEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.removeAttribute("open");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.open) {
        details.removeAttribute("open");
        details.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    details.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      details.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details
      ref={ref}
      data-menu=""
      className="group relative ml-auto min-w-0"
      data-testid="demo-menu"
    >
      <summary
        data-surface="inverse"
        className={cn(
          "flex h-11 min-w-0 cursor-pointer list-none items-center gap-2 rounded-full px-3 text-fs-2 font-semibold lg:h-8",
          "bg-inverse-text/8 text-inverse-text transition-[background-color,scale] duration-(--dur-2) ease-spring hover:bg-inverse-text/15 active:scale-(--motion-press) group-open:bg-inverse-text/20",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="sr-only">{labels.menu}: </span>
        <UserIcon size="sm" className="shrink-0 text-inverse-accent" />
        <span data-testid="demo-current-persona" className="max-w-[9rem] truncate sm:max-w-[12rem]">
          {currentPersona}
        </span>
        <span aria-hidden="true" className="hidden h-4 border-l border-inverse-muted/50 sm:block" />
        <span className="sr-only">, </span>
        <span
          data-testid="demo-current-context"
          className="hidden max-w-[16rem] truncate font-normal text-inverse-muted sm:block"
        >
          {currentContext}
        </span>
        <ChevronDownIcon
          size="sm"
          className="shrink-0 transition-transform duration-(--dur-3) ease-spring group-open:rotate-180"
        />
      </summary>
      <div
        className={cn(
          "absolute top-[calc(100%_+_0.375rem)] right-0 z-50 grid w-[min(36rem,calc(100vw_-_2_*_var(--gutter)))] gap-5",
          "max-h-[calc(100dvh_-_var(--demo-bar-h)_-_1rem)] overflow-y-auto overscroll-contain",
          "rounded-overlay border border-hairline bg-surface-raised p-4 text-text shadow-overlay sm:p-5",
        )}
      >
        <p className="m-0 text-fs-2 text-muted lg:hidden">{labels.note}</p>
        <OptionGroup
          name="persona"
          legend={labels.choosePersona}
          choice={persona}
          currentText={labels.current}
          action={switchPersona}
          onPick={close}
          testId="demo-persona-switcher"
          columns="grid-cols-1 min-[360px]:grid-cols-2"
        />
        <OptionGroup
          name="context"
          legend={labels.chooseContext}
          choice={context}
          currentText={labels.current}
          action={switchContext}
          onPick={close}
          testId="demo-context-switcher"
          columns="grid-cols-1 sm:grid-cols-2"
        />
        <form
          action={resetAction}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-divider pt-4"
        >
          <button
            type="submit"
            className={buttonClasses({ variant: "outline", size: "sm" })}
            aria-disabled={resetting || undefined}
            data-testid="demo-reset"
          >
            <RefreshIcon />
            {labels.reset}
          </button>
          <p className="m-0 min-w-0 flex-1 basis-48 text-fs-2 text-muted">{labels.resetHint}</p>
          <p
            role="status"
            className="m-0 basis-full text-fs-2 font-semibold"
            data-testid="demo-reset-status"
          >
            {reset.status === "done" && (
              <span key={reset.count} className="text-success">
                {labels.resetDone}
              </span>
            )}
            {reset.status === "failed" && <span className="text-danger">{labels.resetFailed}</span>}
          </p>
        </form>
      </div>
    </details>
  );
}

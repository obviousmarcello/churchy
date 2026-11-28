"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckIcon, RefreshIcon, UserIcon, buttonClasses, cn } from "@churchy/ui";
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
  /**
   * `chip`: the small floating *Demo* button of every page but the landing page. `footer`: the
   * tiny *Demo* link in the landing page's footer. Both open the same menu.
   */
  variant: "chip" | "footer";
  persona: Choice;
  context: Choice;
  labels: {
    chip: string;
    menu: string;
    banner: string;
    note: string;
    now: string;
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
 * The demo menu (client part of the demo chip and of the landing footer's *Demo* link): a
 * disclosure, collapsed by default, whose panel holds the *Bemutató — nem valós adatok* notice, the
 * current role and church, both switchers and *Visszaállítás*. Escape or a click outside closes it.
 */
export function DemoControls({ variant, persona, context, labels }: DemoControlsProps) {
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
      className={cn("group relative", variant === "footer" && "inline-block")}
      data-testid="demo-menu"
    >
      <summary
        data-surface="inverse"
        // The tooltip repeats the notice, so it is there on hover even while the menu is closed.
        title={labels.banner}
        className={cn(
          "flex min-h-11 cursor-pointer list-none items-center gap-2 text-fs-2 font-semibold",
          "[&::-webkit-details-marker]:hidden",
          variant === "chip"
            ? "min-w-11 rounded-full bg-inverse px-4 text-inverse-text shadow-overlay transition-[background-color,scale,box-shadow] duration-(--dur-2) ease-spring hover:shadow-raised active:scale-(--motion-press) group-open:bg-inverse"
            : "rounded-full px-2 text-inverse-muted underline decoration-inverse-muted/50 underline-offset-4 hover:text-inverse-text",
        )}
      >
        {variant === "chip" ? (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-inverse-accent" />
        ) : null}
        <span>{labels.chip}</span>
        <span className="sr-only">
          : {labels.banner}. {labels.menu}.
        </span>
      </summary>
      <div
        className={cn(
          // The chip's panel opens above the chip; the footer link's is a sheet pinned to the
          // viewport's bottom-left, so it is never cut off wherever the link sits on the page.
          variant === "chip"
            ? "absolute bottom-[calc(100%_+_0.5rem)] left-0 max-h-[calc(100dvh_-_7rem)]"
            : "fixed bottom-4 left-4 max-h-[calc(100dvh_-_2rem)]",
          "z-50 grid w-[min(34rem,calc(100vw_-_2rem))] gap-5 overflow-y-auto overscroll-contain",
          "origin-bottom-left rounded-overlay border border-hairline bg-surface-raised p-4 text-left text-text no-underline shadow-overlay sm:p-5",
        )}
      >
        <div className="grid gap-1">
          <p className="m-0 flex items-center gap-2 text-fs-3 font-semibold text-text">
            <UserIcon size="sm" className="shrink-0 text-accent-text" />
            <span>{labels.banner}</span>
          </p>
          <p className="m-0 text-fs-2 text-muted">{labels.note}</p>
          <p className="m-0 text-fs-2 text-muted">
            {labels.now}: <span data-testid="demo-current-persona">{currentPersona}</span>
            {" · "}
            <span data-testid="demo-current-context">{currentContext}</span>
          </p>
        </div>
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

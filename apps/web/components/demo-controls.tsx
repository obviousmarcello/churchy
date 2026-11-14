"use client";

import { useActionState, useEffect, useRef } from "react";
import { cn } from "@churchy/ui";
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
    persona: string;
    context: string;
    choosePersona: string;
    chooseContext: string;
    current: string;
    reset: string;
    resetDone: string;
    resetFailed: string;
  };
}

const controlClasses =
  "inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-inverse-muted px-3 font-semibold " +
  "text-inverse-text hover:border-inverse-accent";

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 transition-transform duration-(--duration) group-open:rotate-180"
    >
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * One switcher: a disclosure (`<details>`) with one submit button per option, so switching takes
 * two clicks (open, pick) and works without JavaScript. Closes itself after the switch.
 */
function Switcher({
  name,
  label,
  legend,
  choice,
  currentText,
  action,
  testId,
}: {
  name: string;
  label: string;
  legend: string;
  choice: Choice;
  currentText: string;
  action: (formData: FormData) => Promise<void>;
  testId: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const current = choice.options.find((o) => o.value === choice.value);

  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [choice.value]);

  return (
    <details ref={ref} className="group open:basis-full" data-testid={testId}>
      <summary
        className={cn(
          controlClasses,
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <span>
          {label}: <span className="text-inverse-accent">{current?.label}</span>
        </span>
        <Chevron />
      </summary>
      <form
        action={action}
        onSubmit={() => ref.current?.removeAttribute("open")}
        className="mt-2 mb-1"
      >
        <fieldset>
          <legend className="mb-2 font-semibold">{legend}</legend>
          <ul className="grid list-none grid-cols-1 gap-2 p-0 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {choice.options.map((option) => {
              const selected = option.value === choice.value;
              return (
                <li key={option.value}>
                  <button
                    type="submit"
                    name={name}
                    value={option.value}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      controlClasses,
                      "w-full justify-start text-left",
                      selected && "border-inverse-accent bg-inverse-text/10",
                    )}
                  >
                    {option.label}
                    {selected && <span className="sr-only"> {currentText}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      </form>
    </details>
  );
}

/** Persona and church switchers plus *Visszaállítás* (client part of the demo bar). */
export function DemoControls({ persona, context, labels }: DemoControlsProps) {
  const [reset, resetAction, resetting] = useActionState<ResetResult, FormData>(
    (previous) => resetDemo(previous),
    { status: "idle", count: 0 },
  );

  return (
    <>
      <Switcher
        name="persona"
        label={labels.persona}
        legend={labels.choosePersona}
        choice={persona}
        currentText={labels.current}
        action={switchPersona}
        testId="demo-persona-switcher"
      />
      <Switcher
        name="context"
        label={labels.context}
        legend={labels.chooseContext}
        choice={context}
        currentText={labels.current}
        action={switchContext}
        testId="demo-context-switcher"
      />
      <form action={resetAction} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className={controlClasses}
          aria-disabled={resetting || undefined}
          data-testid="demo-reset"
        >
          {labels.reset}
        </button>
        <p role="status" className="m-0" data-testid="demo-reset-status">
          {reset.status === "done" && <span key={reset.count}>{labels.resetDone}</span>}
          {reset.status === "failed" && labels.resetFailed}
        </p>
      </form>
    </>
  );
}

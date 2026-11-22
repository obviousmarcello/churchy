import { useId, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { cn } from "../cn";

export interface SegmentedOption {
  value: string;
  label: string;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  /** Accessible name of the group ("Nézet"). Shown above the control when `labelVisible`. */
  label: string;
  labelVisible?: boolean;
  /** Form field name of the radios. */
  name: string;
  /** 2–6 short options of similar length (they get equal widths). */
  options: SegmentedOption[];
  /** Uncontrolled initial value. */
  defaultValue?: string;
  /** Controlled value (use with `onValueChange`). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Stretch to the container width (default: as wide as the options need). */
  fullWidth?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Segmented control (design v2): a rounded track with equal-width options and a raised thumb that
 * slides to the chosen one with a spring. It is a group of native radios, so it works without
 * JavaScript, inside a `<form>`, with arrow keys and with screen readers; the slide is pure CSS
 * (`:has(:checked)`, see motion.css). Use it for 2–6 mutually exclusive views or filters
 * ("Nap / Hét / Hónap"); for panels use `Tabs`, for routes `NavTabs`.
 */
export function SegmentedControl({
  label,
  labelVisible = false,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  fullWidth = false,
  className,
  "data-testid": testId,
}: SegmentedControlProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const controlled = value !== undefined;
  const onChange = onValueChange
    ? (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)
    : undefined;
  return (
    <div className={cn("grid gap-2", fullWidth ? "w-full" : "w-fit max-w-full", className)}>
      <span id={labelId} className={labelVisible ? "text-fs-3 font-semibold text-text" : "sr-only"}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-segmented=""
        data-testid={testId}
        style={{ "--seg-count": options.length } as CSSProperties}
        className="relative grid auto-cols-fr grid-flow-col rounded-button bg-surface-sunken p-1"
      >
        <span
          aria-hidden="true"
          data-segmented-thumb=""
          className={cn(
            "pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%_-_0.5rem)/var(--seg-count))]",
            "rounded-[max(calc(var(--radius-button)_-_4px),6px)] bg-surface-raised shadow-card",
            "transition-[transform,opacity] duration-(--dur-3) ease-spring",
          )}
        />
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative z-[1] flex min-h-(--control-h-md) cursor-pointer items-center justify-center gap-2 px-4 text-center",
              "rounded-[max(calc(var(--radius-button)_-_4px),6px)] text-fs-3 font-semibold whitespace-nowrap text-muted",
              "transition-[color,scale] duration-(--dur-2) ease-standard hover:text-text active:scale-(--motion-press)",
              "has-[:checked]:text-text has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55",
              "has-[:focus-visible]:outline-(length:--focus-width) has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-solid",
              "[&_svg]:size-5 [&_svg]:shrink-0",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              disabled={option.disabled}
              className="sr-only"
              {...(controlled
                ? { checked: value === option.value, onChange: onChange ?? (() => undefined) }
                : { defaultChecked: defaultValue === option.value, onChange })}
            />
            {option.icon}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

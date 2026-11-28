"use client";

import { useId } from "react";

/** A row of radio buttons that look like a segmented control. */
export function Choice<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const name = useId();

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-xs font-medium text-muted">{label}</legend>
      <div className="flex gap-0.5 rounded-card border p-0.5">
        {options.map((option) => (
          <label
            key={String(option.value)}
            className="flex-1 cursor-pointer rounded-control px-2 py-1 text-center pointer-coarse:py-1.5 text-sm transition-colors hover:bg-surface-sunken has-checked:bg-primary has-checked:text-primary-contrast has-focus-visible:ring-3 has-focus-visible:ring-focus/50"
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

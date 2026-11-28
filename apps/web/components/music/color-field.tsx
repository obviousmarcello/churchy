"use client";

import { Label } from "@/components/music/ui/label";

/** A color picker with its label and its `#rrggbb` value. `onChange` gets the value in lower case. */
export function ColorField({
  id,
  label,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The id of a note about the color, e.g. a contrast warning. */
  describedBy?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
        aria-describedby={describedBy}
        className="size-9 shrink-0 cursor-pointer rounded-control border bg-transparent p-0.5"
      />
      <Label htmlFor={id}>{label}</Label>
      <span className="font-mono text-xs text-muted uppercase">{value}</span>
    </div>
  );
}

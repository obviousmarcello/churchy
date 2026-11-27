"use client";

import { LockIcon } from "lucide-react";

import { cn } from "@/lib/music/utils";

/**
 * A box of a group in a list of groups, e.g. the groups of an event or of a
 * course. A locked box is off, with a lock: `describedBy` names the note that
 * says why.
 */
export function GroupOption({
  label,
  checked,
  onChange,
  locked = false,
  describedBy,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  locked?: boolean;
  describedBy?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        locked ? "text-muted" : "cursor-pointer",
        checked && "border-primary bg-primary/10",
      )}
    >
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        disabled={locked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={describedBy}
      />
      {label}
      {locked && <LockIcon className="size-3.5 shrink-0" aria-hidden />}
    </label>
  );
}

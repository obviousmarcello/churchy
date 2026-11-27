"use client";

import { Avatar } from "@base-ui/react/avatar";

import { cn } from "@/lib/music/utils";

export type AvatarPerson = {
  id: string;
  /** Null when the viewer may not see it (see `PersonDTO`). */
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

const SIZES = {
  sm: "size-6 text-[0.625rem]",
  md: "size-8 text-xs",
  lg: "size-16 text-xl",
};

// Literal class names, so Tailwind finds them.
const COLORS = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

/**
 * The user's avatar image, or their initials on a color of their own. The
 * caller shows the name: screen readers skip the avatar.
 */
export function UserAvatar({
  person,
  size = "md",
  className,
}: {
  person: AvatarPerson;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Avatar.Root
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle leading-none font-medium select-none",
        SIZES[size],
        COLORS[hash(person.id) % COLORS.length],
        className,
      )}
    >
      {person.avatarUrl && (
        <Avatar.Image src={person.avatarUrl} alt="" className="size-full object-cover" />
      )}
      <Avatar.Fallback>{initials(person)}</Avatar.Fallback>
    </Avatar.Root>
  );
}

/** For example "AK" for "Anna Kovács", or "JS" for "john.smith@example.com". */
function initials(person: Pick<AvatarPerson, "displayName" | "email">): string {
  const words = person.displayName
    ? person.displayName.split(/\s+/)
    : (person.email ?? "").split("@")[0]!.split(/[._+-]+/);
  const letters = words.filter(Boolean).map((word) => Array.from(word)[0]);
  const result =
    letters.length > 1 ? letters[0]! + letters[letters.length - 1]! : (letters[0] ?? "?");
  return result.toUpperCase();
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

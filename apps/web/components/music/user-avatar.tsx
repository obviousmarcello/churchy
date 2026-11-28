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
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-warning-soft text-warning",
  "bg-danger-soft text-danger",
  "bg-primary-soft text-primary",
  "bg-accent-soft text-accent-text",
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

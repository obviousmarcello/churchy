"use client";

import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleQuestionMarkIcon,
  CircleXIcon,
} from "lucide-react";

import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import type { VolunteerReply } from "@/lib/music/volunteer-replies";

// The reply of a volunteer to an event, as an icon: can they come? `null`
// is no reply yet.

const ICONS = {
  yes: CircleCheckIcon,
  maybe: CircleQuestionMarkIcon,
  no: CircleXIcon,
  none: CircleDashedIcon,
};

const COLORS = {
  yes: "text-emerald-600 dark:text-emerald-400",
  maybe: "text-amber-600 dark:text-amber-400",
  no: "text-danger",
  none: "text-muted",
};

/** The icon of the reply. With `label`, screen readers also read the reply, e.g. after a name. */
export function ReplyIcon({
  reply,
  label = false,
  className,
}: {
  reply: VolunteerReply | null;
  label?: boolean;
  className?: string;
}) {
  const { m } = useI18n();
  const key = reply ?? "none";
  const Icon = ICONS[key];

  return (
    <>
      <Icon aria-hidden className={cn("size-4 shrink-0", COLORS[key], className)} />
      {label && <span className="sr-only">{m.events.replies[key]}</span>}
    </>
  );
}

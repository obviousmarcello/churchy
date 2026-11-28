"use client";

import { Popover } from "@base-ui/react/popover";

import { UserAvatar, type AvatarPerson } from "@/components/music/user-avatar";
import { ReplyIcon } from "@/components/music/volunteer-reply";
import { useI18n } from "@/i18n/music/client";
import { personName } from "@/lib/music/format";
import type { VolunteerReply } from "@/lib/music/volunteer-replies";
import { ReplyForm } from "./reply-form";

type Volunteer = AvatarPerson & { reply: VolunteerReply | null };

/** The signed-in volunteer, who can change their reply in the popover of their chip. */
export type MyReplyTarget = { eventId: string; userId: string; reply: VolunteerReply | null };

type Layout = "chips" | "rows";

const CLASS_NAMES: Record<Layout, string> = {
  chips:
    "flex max-w-56 items-center gap-2 rounded-full border bg-surface py-1 pr-3 pl-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-focus/50",
  rows: "flex w-full min-w-0 items-center gap-3 rounded-card py-1.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-focus/50",
};

/**
 * The volunteers of an event as chips with their avatar, name and reply. The email
 * shows on hover and on a tap (touch screens have no hover), to superadmins:
 * for the others, the model leaves it empty (`listEventVolunteers()`). With
 * `myReply`, a click on the chip of the signed-in volunteer opens their reply.
 */
export function VolunteerList({
  volunteers,
  myReply,
  layout = "chips",
}: {
  volunteers: Volunteer[];
  myReply?: MyReplyTarget | null;
  /** `rows`: one volunteer on each line, with the reply as text, e.g. in a team card. */
  layout?: Layout;
}) {
  const chipClassName = CLASS_NAMES[layout];
  const Content = layout === "rows" ? Row : Chip;

  return (
    <ul className={layout === "rows" ? "flex flex-col gap-1" : "flex flex-wrap gap-2"}>
      {volunteers.map((person) => (
        <li key={person.id}>
          {myReply && person.id === myReply.userId ? (
            <MyChip person={person} myReply={myReply} layout={layout} />
          ) : person.displayName && person.email ? (
            <Popover.Root>
              <Popover.Trigger
                openOnHover
                render={<button type="button" className={chipClassName} />}
              >
                <Content person={person} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={6} collisionPadding={8}>
                  <Popover.Popup className="origin-[var(--transform-origin)] rounded-control bg-inverse px-2 py-1 text-xs text-inverse-text shadow-md transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
                    {person.email}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          ) : (
            <span className={chipClassName}>
              <Content person={person} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The chip of the signed-in volunteer: a click opens the reply buttons, and the email if the viewer sees it. */
function MyChip({
  person,
  myReply,
  layout,
}: {
  person: Volunteer;
  myReply: MyReplyTarget;
  layout: Layout;
}) {
  const { m } = useI18n();
  const Content = layout === "rows" ? Row : Chip;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button type="button" className={CLASS_NAMES[layout]} title={m.events.replyForm.change} />
        }
      >
        <Content person={person} />
        <span className="sr-only">{m.events.replyForm.change}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} collisionPadding={8} className="z-50">
          <Popover.Popup className="flex max-w-(--available-width) origin-[var(--transform-origin)] flex-col gap-2 rounded-card border bg-surface-raised p-3 text-text shadow-md transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            {person.displayName && person.email && (
              <span className="text-xs text-muted">{person.email}</span>
            )}
            <ReplyForm eventId={myReply.eventId} reply={myReply.reply} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Chip({ person }: { person: Volunteer }) {
  const i18n = useI18n();

  return (
    <>
      <UserAvatar person={person} size="sm" />
      <span className="truncate">{personName(person, i18n)}</span>
      <ReplyIcon reply={person.reply} label className="-mr-1" />
    </>
  );
}

/** A volunteer on a line of its own: the avatar, the name, and the reply as text. */
function Row({ person }: { person: Volunteer }) {
  const i18n = useI18n();
  const reply = person.reply ?? "none";

  return (
    <>
      <UserAvatar person={person} size="md" />
      <span className="min-w-0 flex-1 truncate font-medium">{personName(person, i18n)}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
        <ReplyIcon reply={person.reply} className="size-3.5" />
        {i18n.m.events.replies[reply]}
      </span>
    </>
  );
}

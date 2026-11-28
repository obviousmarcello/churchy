"use client";

import { useActionState, useId } from "react";

import { invalidating } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import { ReplyIcon } from "@/components/music/volunteer-reply";
import { useI18n } from "@/i18n/music/client";
import { changedPages } from "@/lib/music/page-keys";
import { toastResult } from "@/lib/music/toast";
import { VOLUNTEER_REPLIES, type VolunteerReply } from "@/lib/music/volunteer-replies";
import { setReplyAction, type EventFormState } from "./actions-client";

const initialState: EventFormState = { status: "idle", message: null, fieldErrors: {} };

/**
 * "Can you come?" with small buttons Yes, Maybe and No, for a volunteer of
 * the event: in the volunteers card until they reply, then in the popover of
 * their own chip.
 */
export function ReplyForm({ eventId, reply }: { eventId: string; reply: VolunteerReply | null }) {
  const [state, formAction, pending] = useActionState(
    async (previous: EventFormState, formData: FormData) => {
      const result = await invalidating(changedPages.event(eventId), setReplyAction)(
        previous,
        formData,
      );
      // Not in an effect: the first reply removes the form from the card in the same render.
      toastResult(result);
      return result;
    },
    initialState,
  );
  const { m } = useI18n();
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      {/* The clicked button sends its value as `reply`. */}
      <form
        action={formAction}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
      >
        <span id={`${id}-title`} className="text-sm font-medium">
          {m.events.replyForm.title}
        </span>
        <span id={`${id}-description`} className="sr-only">
          {m.events.replyForm.description}
        </span>
        <input type="hidden" name="id" value={eventId} />
        {VOLUNTEER_REPLIES.map((value) => (
          <Button
            key={value}
            type="submit"
            name="reply"
            value={value}
            variant={reply === value ? "secondary" : "outline"}
            size="sm"
            aria-pressed={reply === value}
            disabled={pending}
          >
            <ReplyIcon reply={value} />
            {m.events.replyForm[value]}
          </Button>
        ))}
      </form>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

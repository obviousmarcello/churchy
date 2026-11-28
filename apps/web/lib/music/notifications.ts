/** The notifications of the music module (merged Music Sheet DB, `src/lib/notifications.ts`). */

/** The kinds of notification; each goes to the outbox (email) and to the devices with push on. */
export type NotificationKind = "event_added" | "event_reminder" | "setlist";

/** "Event is within n days": the default and the limits of n. */
export const REMINDER_DAYS = { default: 5, min: 1, max: 30 } as const;
/** "The setlist n hours before the event": the default and the limits of n. */
export const SETLIST_HOURS = { default: 2, min: 1, max: 12 } as const;

import type huMessages from "@messages/hu.json";

/** The music namespace of messages/hu.json (folded from Music Sheet DB's `messages/hu/*`). */
export type Messages = (typeof huMessages)["music"];

/**
 * A text that depends on a count, e.g. `{ one: "{count} dal", other: "{count} dal" }`. Hungarian
 * uses the same text for both, because a noun after a number stays singular.
 */
export type Plural = { one: string; other: string };

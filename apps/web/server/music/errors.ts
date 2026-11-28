import "server-only";

import huMessages from "@messages/hu.json";
import { createI18n, type Text } from "@/i18n/music/i18n";

/** The texts for the server log (Hungarian; the music app logged English). */
export const LOG_MESSAGES = huMessages.music;

// Errors that callers (Server Actions, Route Handlers) may translate into a
// response. Their messages are safe to show; no database details leak.
//
// The models do not know the language of the caller, so each error keeps a
// `Text`: a function that gives the message in a language. The caller
// translates it with `getRequestI18n()`. `Error.message` is the English text,
// for the server log.

export type { Text };

export type Issue = { path: string; message: Text };

function english(text: Text): string {
  return text(createI18n(LOG_MESSAGES));
}

/** An error with a message that is safe to show to the user. */
export class SafeError extends Error {
  readonly text: Text;

  constructor(text: Text) {
    super(english(text));
    this.name = "SafeError";
    this.text = text;
  }
}

export class ValidationError extends Error {
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(english(({ m }) => m.common.errors.invalidInput));
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** The caller is not signed in. */
export class UnauthorizedError extends SafeError {
  constructor() {
    super(({ m }) => m.common.errors.signIn);
    this.name = "UnauthorizedError";
  }
}

/** Sign-in or two-step verification failed. */
export class AuthenticationError extends SafeError {
  constructor(text: Text) {
    super(text);
    this.name = "AuthenticationError";
  }
}

/** The caller is signed in but lacks permission. */
export class ForbiddenError extends SafeError {
  constructor() {
    super(({ m }) => m.common.errors.forbidden);
    this.name = "ForbiddenError";
  }
}

/** The change conflicts with existing data, e.g. a duplicate slug. */
export class ConflictError extends SafeError {
  constructor(text: Text) {
    super(text);
    this.name = "ConflictError";
  }
}

/**
 * The change would take an open projection of the event from its user. The
 * caller can try again and end the projection (see `endingProjections`).
 */
export class ProjectionUserError extends ConflictError {
  constructor() {
    super(({ m }) => m.server.events.projectionUser);
    this.name = "ProjectionUserError";
  }
}

/**
 * A projection of the event is open, so the delete stops. The caller can try
 * again and end the projection (see `endingProjections`).
 */
export class ProjectionOpenError extends ConflictError {
  constructor() {
    super(({ m }) => m.server.events.projectionOpen);
    this.name = "ProjectionOpenError";
  }
}

/**
 * The module of the call is off (the Modules tab of Configuration). The form
 * state gets the code `moduleOff`: the page of an old tab loads again.
 */
export class ModuleOffError extends ConflictError {
  readonly moduleId: string;

  constructor(moduleId: string, name: Text) {
    super((i18n) => i18n.format(i18n.m.modules.errors.off, { module: name(i18n) }));
    this.name = "ModuleOffError";
    this.moduleId = moduleId;
  }
}

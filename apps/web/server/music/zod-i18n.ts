import "server-only";

import type { z } from "zod";

import type { I18n, Text } from "@/i18n/music/i18n";

// Translated messages for the input checks of the models.
//
// Zod messages must be strings, but the language is not known when a model
// checks its input. Thus a custom message is an id from `zodMessage()`, and
// `issueText()` turns each issue into a `Text` that the caller translates.
// The usual checks (required, too long, ...) get the messages in
// `m.common.validation`.

type Params = Record<string, unknown>;
type IssueMessage = (i18n: I18n, params: Params) => string;

const PREFIX = "i18n:";
const registry = new Map<string, IssueMessage>();

/**
 * A custom message for a Zod check, e.g.
 * `.regex(pattern, { message: zodMessage(({ m }) => m.server.songs.keyFormat) })`.
 * Call it once, when the module loads, not on each parse. For values that
 * change, add a custom issue with `params` and read them from the second argument.
 */
export function zodMessage(message: IssueMessage): string {
  const id = `${PREFIX}${registry.size}`;
  registry.set(id, message);
  return id;
}

/** The message of a Zod issue, in the language of the caller. */
export function issueText(issue: z.core.$ZodIssue): Text {
  const custom = registry.get(issue.message);
  if (custom) {
    const params: Params = issue.code === "custom" ? (issue.params ?? {}) : {};
    return (i18n) => custom(i18n, params);
  }
  return (i18n) => defaultMessage(i18n, issue);
}

function defaultMessage(i18n: I18n, issue: z.core.$ZodIssue): string {
  const { m, format, plural } = i18n;
  const v = m.common.validation;

  switch (issue.code) {
    case "invalid_type":
      if (issue.expected === "int") return v.notInteger;
      if (issue.expected === "number") return v.notNumber;
      return v.required;
    case "too_small": {
      const minimum = Number(issue.minimum);
      if (issue.origin === "string") return minimum <= 1 ? v.required : plural(v.tooShort, minimum);
      if (issue.origin === "array" || issue.origin === "set") return plural(v.tooFewItems, minimum);
      return format(v.tooSmall, { min: minimum });
    }
    case "too_big": {
      const maximum = Number(issue.maximum);
      if (issue.origin === "string") return plural(v.tooLong, maximum);
      if (issue.origin === "array" || issue.origin === "set")
        return plural(v.tooManyItems, maximum);
      return format(v.tooBig, { max: maximum });
    }
    case "invalid_format":
      if (issue.format === "email") return v.email;
      if (issue.format === "url") return v.url;
      return v.invalid;
    case "not_multiple_of":
      return v.notInteger;
    case "invalid_value":
    case "invalid_union":
      return v.invalidOption;
    default:
      return v.invalid;
  }
}

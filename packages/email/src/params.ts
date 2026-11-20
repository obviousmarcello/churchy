import { formatDateLong, formatTime } from "@churchy/hu";
import type { EmailParams } from "./types";

/**
 * Resolves an app-relative link (`/munkater/hr/ticket-1`) against `baseUrl`. Anything that is not
 * an app path (other schemes, protocol-relative URLs, empty values) yields `null`, so a template
 * can never turn a parameter into an arbitrary link.
 */
export function absoluteLink(link: unknown, baseUrl: string): string | null {
  if (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//")) return null;
  try {
    return new URL(link, baseUrl).toString();
  } catch {
    return null;
  }
}

/** The `link` param of a message, made absolute. */
export function linkOf(params: EmailParams, baseUrl: string): string | null {
  return absoluteLink(params.link, baseUrl);
}

/**
 * `startsAt` formatted for people: `2026. november 12., csütörtök, 18:00` (Europe/Budapest, via
 * `@churchy/hu`). Returns `null` when the param is missing or not an instant.
 */
export function whenOf(params: EmailParams): string | null {
  const value = params.startsAt;
  if (typeof value !== "string") return null;
  try {
    return `${formatDateLong(value)}, ${formatTime(value)}`;
  } catch {
    return null;
  }
}

/** A string param, or `null` when absent or not a string. */
export function textOf(params: EmailParams, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

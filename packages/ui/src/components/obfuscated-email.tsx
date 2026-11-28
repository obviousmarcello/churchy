"use client";

import { useEffect, useState } from "react";
import { cn } from "../cn";
import { decodeEmail, spokenEmail } from "./email-obfuscation";

export interface ObfuscatedEmailProps {
  /** `encodeEmail(address)` — never the plain address. */
  code: string;
  /** Word shown instead of `@` before hydration, e.g. `kukac`. */
  atWord: string;
  /** Word shown instead of `.` in the domain before hydration, e.g. `pont`. */
  dotWord: string;
  className?: string;
}

/**
 * An email address that is not machine-readable in the server HTML (see `email-obfuscation.ts`):
 * the first render shows `kelemen.ambrus [kukac] pelda [pont] hu` as plain text (no link), and
 * after hydration it becomes an ordinary `mailto:` link. Without JavaScript the text form stays
 * readable for people.
 */
export function ObfuscatedEmail({ code, atWord, dotWord, className }: ObfuscatedEmailProps) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(true), []);
  const email = decodeEmail(code);
  if (email === null) return null;

  if (!revealed) {
    return (
      <span className={cn("break-all", className)} data-email-obfuscated="">
        {spokenEmail(email, atWord, dotWord)}
      </span>
    );
  }
  return (
    <a
      href={`mailto:${email}`}
      className={cn("break-all text-primary underline", className)}
      data-email-revealed=""
    >
      {email}
    </a>
  );
}

"use client";

import { useId } from "react";

import { useI18n } from "@/i18n/music/client";

// Formats a timestamp in the language of the page and the viewer's time
// zone. The server can only use its own time zone, so on a full page load an inline script corrects the text
// before the first paint. On client-side navigations the component renders in
// the browser and the script does not run.
// See `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
export function LocalDateTime({
  date,
  options,
  sameDayAs,
  sameDayOptions,
}: {
  /** ISO 8601 timestamp. */
  date: string;
  options: Intl.DateTimeFormatOptions;
  /**
   * ISO 8601 timestamp, e.g. the start of an event. When `date` is on the
   * same calendar day in the viewer's time zone, `sameDayOptions` apply
   * (e.g. only the time of the end).
   */
  sameDayAs?: string;
  sameDayOptions?: Intl.DateTimeFormatOptions;
}) {
  const id = useId();
  const { locale } = useI18n();
  const sameDay =
    sameDayAs !== undefined && new Date(sameDayAs).toDateString() === new Date(date).toDateString();
  const chosen = sameDay && sameDayOptions ? sameDayOptions : options;
  const scriptOptions =
    sameDayAs !== undefined && sameDayOptions
      ? `new Date(${scriptJson(sameDayAs)}).toDateString()===d.toDateString()?${scriptJson(sameDayOptions)}:${scriptJson(options)}`
      : scriptJson(options);

  return (
    <>
      <time id={id} dateTime={date} suppressHydrationWarning>
        {new Date(date).toLocaleString(locale, chosen)}
      </time>
      <InlineScript
        html={`{var n=document.getElementById(${scriptJson(id)});if(n){var d=new Date(${scriptJson(date)});n.textContent=d.toLocaleString(${scriptJson(locale)},${scriptOptions})}}`}
      />
    </>
  );
}

// JSON for an inline script. "<" is escaped, so a value such as "</script>"
// cannot end the script and inject HTML.
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// Runs on the server render only. React warns about rendered `<script>` tags
// in the browser, so the client renders it as inert text.
function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

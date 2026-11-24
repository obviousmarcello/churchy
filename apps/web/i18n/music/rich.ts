import { Fragment, createElement, type ReactNode } from "react";

/**
 * A message with markup, e.g. "No songs yet. <link>Add a song</link>." Each
 * tag name maps to a function that wraps the text between the tags. Tags
 * cannot nest. Use it after `format()` when the message has values too.
 */
export function rich(
  message: string,
  tags: Record<string, (chunk: string) => ReactNode>,
): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  for (const match of message.matchAll(pattern)) {
    const [whole, name, chunk] = match;
    if (match.index > last) parts.push(message.slice(last, match.index));
    const render = tags[name!];
    parts.push(
      createElement(Fragment, { key: parts.length }, render ? render(chunk ?? "") : chunk),
    );
    last = match.index + whole.length;
  }
  if (last < message.length) parts.push(message.slice(last));
  return parts;
}

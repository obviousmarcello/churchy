// The keys of Music Sheet DB's offline page cache (`lib/page-keys.ts`). Churchy has no browser
// page cache (see components/music/page-cache.tsx): every change names no page.
const none = (): string[] => [];

export const changedPages = {
  songs: none,
  song: none,
  sheets: none,
  event: (_eventId: string): string[] => [],
};

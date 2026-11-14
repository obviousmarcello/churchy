"use client";

import { Button } from "@churchy/ui";

/** Opens the browser's print dialog; the print stylesheet hides the page chrome. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
      data-testid="announcement-print"
    >
      {label}
    </Button>
  );
}

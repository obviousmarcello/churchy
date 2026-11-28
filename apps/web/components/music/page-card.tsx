"use client";

import { use } from "react";

import { DetailPaneContext } from "@/components/music/page-header";
import { Card } from "@/components/music/ui/card";
import { cn } from "@/lib/music/utils";

// One card in a centered column, for the form and detail pages. In the
// detail pane of the list-detail layout (or a `PagePane`), the pane is
// already the card: the content then shows without a second card, at the
// left as the other content of the pane.
export function PageCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  const pane = use(DetailPaneContext);

  if (pane) {
    return (
      <div className="w-full max-w-2xl px-4 py-6 sm:px-6">
        <div className={cn("flex flex-col gap-6", className)} {...props} />
      </div>
    );
  }
  return (
    <div className="w-full max-w-2xl px-4 py-6 sm:px-6">
      <Card className={className} {...props} />
    </div>
  );
}

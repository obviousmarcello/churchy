"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Shows the demo menu's button where it belongs: the floating chip on every page but the landing
 * page (`/`), which has no demo bar at all and offers the same menu as a tiny *Demo* link in its
 * footer instead (`show="landing"`).
 */
export function DemoChipSlot({
  show = "elsewhere",
  children,
}: {
  show?: "elsewhere" | "landing";
  children: ReactNode;
}) {
  const onLanding = usePathname() === "/";
  return onLanding === (show === "landing") ? children : null;
}

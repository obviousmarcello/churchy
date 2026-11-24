"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// `useModuleOffRefresh()` of Music Sheet DB's `components/app-config.tsx` (their per-database
// app configuration is merged into the tenant's site config, PLAN §11.2).

/** Loads the page again after a form error of a module that is off (`code: "moduleOff"`). */
export function useModuleOffRefresh(state: { code?: string } | null | undefined) {
  const router = useRouter();
  const moduleOff = state?.code === "moduleOff";
  useEffect(() => {
    if (moduleOff) router.refresh();
  }, [moduleOff, state, router]);
}

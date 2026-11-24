"use client";

import { createContext, useContext, useEffect } from "react";
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

// The module switches of the music app (`useModule`, `ModuleGate`) come from the tenant's workspace
// modules (`ws.music.*`): the page reads them on the server and gives them to the chord sheet here.
// A module that the page does not name (e.g. `mixer`, a later phase) is off.
const ModulesContext = createContext<Readonly<Record<string, boolean>>>({});

export function MusicModulesProvider({
  modules,
  children,
}: {
  modules: Readonly<Record<string, boolean>>;
  children: React.ReactNode;
}) {
  return <ModulesContext value={modules}>{children}</ModulesContext>;
}

/** Whether a module of the music app is on, e.g. `useModule("sheet.marks")`. */
export function useModule(id: string): boolean {
  return useContext(ModulesContext)[id] === true;
}

/** Shows its children only while the module is on. */
export function ModuleGate({ id, children }: { id: string; children: React.ReactNode }) {
  return useModule(id) ? <>{children}</> : null;
}

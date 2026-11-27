"use client";

import { createContext, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";

import { forgetDatabaseBooks } from "@/lib/music/scripture/load";
import {
  DEFAULT_SCRIPTURE_CONFIG,
  enabledTranslations,
  type ScriptureConfig,
  type ScriptureTranslation,
} from "@/lib/music/scripture/translations";

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
const ScriptureContext = createContext<ScriptureConfig>(DEFAULT_SCRIPTURE_CONFIG);

export function MusicModulesProvider({
  modules,
  scripture = DEFAULT_SCRIPTURE_CONFIG,
  children,
}: {
  modules: Readonly<Record<string, boolean>>;
  /** The Bible translations of the church (`getScriptureConfig`); only read with the scripture module on. */
  scripture?: ScriptureConfig;
  children: React.ReactNode;
}) {
  // After a change of the translations the app does not keep the licensed text of the old configuration.
  const key = `${scripture.karoli}/${scripture.own.map(({ id, source }) => `${id}:${source}`).join(",")}`;
  useEffect(() => forgetDatabaseBooks(), [key]);
  return (
    <ModulesContext value={modules}>
      <ScriptureContext value={scripture}>{children}</ScriptureContext>
    </ModulesContext>
  );
}

/** Whether a module of the music app is on, e.g. `useModule("sheet.marks")`. */
export function useModule(id: string): boolean {
  return useContext(ModulesContext)[id] === true;
}

/** Shows its children only while the module is on. */
export function ModuleGate({ id, children }: { id: string; children: React.ReactNode }) {
  return useModule(id) ? <>{children}</> : null;
}

/** The configuration of the page as the copied components read it: the ids (of the music app) of the modules that are on. */
export function useAppConfig(): { modules: string[] } {
  const modules = useContext(ModulesContext);
  return { modules: Object.keys(modules).filter((id) => modules[id] === true) };
}

const NO_TRANSLATIONS: ScriptureTranslation[] = [];

/** The Bible translations that are on, with the source of their text. Empty while the scripture module is off. */
export function useScriptureTranslations(): ScriptureTranslation[] {
  const scripture = useContext(ScriptureContext);
  return useModule("scripture") ? enabledTranslations(scripture) : NO_TRANSLATIONS;
}

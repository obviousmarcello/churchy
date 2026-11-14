import { getT } from "@/i18n/server";
import { DEMO_PERSONA_KEYS, contextOf } from "@/lib/demo/personas";
import { getDemoState } from "@/server/demo";
import { DemoControls, type DemoOption } from "./demo-controls";

/**
 * Demo bar (D-92), rendered by the root layout on every page while `DEMO_MODE=1`: the banner
 * *„Bemutató — nem valós adatok”*, the role and church switchers that replace login, and
 * *Visszaállítás*. Renders nothing outside demo mode.
 *
 * It sits above the page in normal flow (not fixed), so it never covers page content.
 */
export async function DemoBar() {
  const demo = await getDemoState();
  if (demo === null) return null;
  const [t, personas] = await Promise.all([getT("common.demo"), getT("common.demo.personas")]);
  const { selection, directory } = demo;

  const personaOptions: DemoOption[] = DEMO_PERSONA_KEYS.map((key) => ({
    value: key,
    label: personas(key),
  }));
  const contextLabel = (id: string) => {
    const context = contextOf(directory, id);
    return context.kind === "org" ? t("orgContext", { name: context.name }) : context.name;
  };
  const contextOptions: DemoOption[] = directory.contexts.map((c) => ({
    value: c.id,
    label: contextLabel(c.id),
  }));

  return (
    <section
      aria-label={t("regionLabel")}
      data-surface="inverse"
      data-testid="demo-banner"
      className="border-b-4 border-inverse-accent bg-inverse text-inverse-text"
    >
      <div className="mx-auto flex w-full max-w-(--content-max) flex-wrap items-center gap-x-4 gap-y-2 px-(--gutter) py-2 text-fs-2">
        <p className="m-0 mr-auto">
          <strong className="font-bold">{t("banner")}</strong>{" "}
          <span className="text-inverse-muted">{t("bannerNote")}</span>
        </p>
        <DemoControls
          persona={{ value: selection.persona, options: personaOptions }}
          context={{ value: selection.contextId, options: contextOptions }}
          labels={{
            persona: t("persona"),
            context: t("context"),
            choosePersona: t("choosePersona"),
            chooseContext: t("chooseContext"),
            current: t("current"),
            reset: t("reset"),
            resetDone: t("resetDone"),
            resetFailed: t("resetFailed"),
          }}
        />
      </div>
    </section>
  );
}

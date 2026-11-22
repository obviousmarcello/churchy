import { getT } from "@/i18n/server";
import { DEMO_PERSONA_KEYS, contextOf } from "@/lib/demo/personas";
import { getDemoState } from "@/server/demo";
import { DemoControls, type DemoOption } from "./demo-controls";

/**
 * Demo bar (D-92), rendered by the root layout on every page while `DEMO_MODE=1`: one thin line with
 * the banner *„Bemutató — nem valós adatok”* and a single menu that holds the role and church
 * switchers (which replace login) and *Visszaállítás*. Renders nothing outside demo mode.
 *
 * It sits above the page in normal flow (not fixed), so it never covers page content, and it is at
 * most `--demo-bar-h` tall (44 px on phones, 40 px from 64rem).
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
      data-testid="demo-banner"
      // Stays put during page transitions (motion.css anchors the `demo-bar` view transition).
      style={{ viewTransitionName: "demo-bar" }}
      className="relative z-[45] bg-inverse text-inverse-text"
    >
      <div className="mx-auto flex h-(--demo-bar-h) w-full max-w-(--content-max) items-center gap-3 px-(--gutter)">
        <p className="m-0 flex min-w-0 shrink-0 items-center gap-2 text-fs-1 leading-none sm:text-fs-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-inverse-accent" />
          <strong className="font-semibold whitespace-nowrap text-inverse-accent">
            {t("banner")}
          </strong>
          <span className="hidden truncate text-inverse-muted lg:inline">{t("bannerNote")}</span>
        </p>
        <DemoControls
          persona={{ value: selection.persona, options: personaOptions }}
          context={{ value: selection.contextId, options: contextOptions }}
          labels={{
            menu: t("menu"),
            note: t("bannerNote"),
            persona: t("persona"),
            context: t("context"),
            choosePersona: t("choosePersona"),
            chooseContext: t("chooseContext"),
            current: t("current"),
            reset: t("reset"),
            resetHint: t("resetHint"),
            resetDone: t("resetDone"),
            resetFailed: t("resetFailed"),
          }}
        />
      </div>
    </section>
  );
}

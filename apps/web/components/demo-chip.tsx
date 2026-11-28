import { getT } from "@/i18n/server";
import { DEMO_PERSONA_KEYS, contextOf } from "@/lib/demo/personas";
import { getDemoState } from "@/server/demo";
import { DemoChipSlot } from "./demo-chip-slot";
import { DemoControls, type DemoOption } from "./demo-controls";

/**
 * The demo menu (D-92): the *Bemutató — nem valós adatok* notice, the role and church switchers
 * (which replace login) and *Visszaállítás*, in a disclosure. Renders nothing outside demo mode.
 * `variant` picks the button that opens it: the floating chip or the landing footer's link.
 */
export async function DemoMenu({ variant }: { variant: "chip" | "footer" }) {
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
    <DemoControls
      variant={variant}
      persona={{ value: selection.persona, options: personaOptions }}
      context={{ value: selection.contextId, options: contextOptions }}
      labels={{
        chip: variant === "chip" ? t("chip") : t("footerLink"),
        menu: t("menu"),
        banner: t("banner"),
        note: t("bannerNote"),
        now: t("now"),
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
  );
}

/**
 * The floating *Demo* chip, rendered by the root layout on every page but the landing page while
 * `DEMO_MODE=1`: small, rounded, bottom-left, collapsed by default (44 px target). The notice
 * *„Bemutató — nem valós adatok”* stays on the chip's tooltip and screen-reader text and is the
 * first thing in its menu. Above the workspace's bottom bar on phones; never printed.
 */
export async function DemoChip() {
  const demo = await getDemoState();
  if (demo === null) return null;
  const t = await getT("common.demo");
  return (
    <DemoChipSlot>
      <section
        aria-label={t("regionLabel")}
        data-testid="demo-banner"
        // Stays put during page transitions (motion.css anchors the `demo-bar` view transition).
        style={{ viewTransitionName: "demo-bar" }}
        className="fixed bottom-20 left-3 z-[55] md:bottom-4 md:left-4 print:hidden"
      >
        <DemoMenu variant="chip" />
      </section>
    </DemoChipSlot>
  );
}

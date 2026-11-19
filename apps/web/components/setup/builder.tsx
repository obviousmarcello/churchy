import type { ImportStage } from "@churchy/contracts";
import { cn } from "@churchy/ui";
import styles from "./builder.module.css";

/**
 * The setup animation (D-34): small robots build a church while the import runs, one piece per
 * completed stage. Inline SVG and CSS only. Decorative: hidden from assistive technology, the
 * live progress text carries the information. Colours are theme tokens, so the finished church
 * is painted in the site's own colours.
 */
export function Builder({
  completed,
  running,
  className,
}: {
  completed: readonly ImportStage[];
  /** An import is in progress (the robots work). */
  running: boolean;
  className?: string;
}) {
  const on = (stage: ImportStage) => completed.includes(stage);
  const painted = on("theme");
  const done = on("draft");
  return (
    <svg
      viewBox="0 0 480 300"
      aria-hidden="true"
      focusable="false"
      className={cn(styles.scene, className)}
      data-testid="setup-builder"
      data-running={running && !done}
      data-done={done}
      data-pieces={completed.length}
    >
      {/* Sky and ground. */}
      <rect width="480" height="300" className="fill-surface-sunken" />
      <circle cx="420" cy="52" r="22" className="fill-accent-soft" />
      <rect y="250" width="480" height="50" className="fill-surface-raised" />
      <line x1="0" x2="480" y1="250" y2="250" className="stroke-border-strong" strokeWidth="2" />

      {/* 1 · fetched: the foundation. */}
      <g className={styles.piece} data-on={on("fetched")} data-piece="fetched">
        <rect x="104" y="238" width="272" height="14" rx="2" className="fill-border-strong" />
        <rect x="92" y="244" width="8" height="12" className="fill-muted" />
        <rect x="380" y="244" width="8" height="12" className="fill-muted" />
      </g>

      {/* 2 · pages: the walls of the nave and the tower. */}
      <g className={styles.piece} data-on={on("pages")} data-piece="pages">
        <rect
          x="126"
          y="160"
          width="228"
          height="78"
          className="fill-surface-raised stroke-border-strong"
          strokeWidth="2"
        />
        <path d="M144 160v78M162 160v78M318 160v78M336 160v78" className="stroke-border" />
        <rect
          x="96"
          y="118"
          width="38"
          height="120"
          className="fill-surface-raised stroke-border-strong"
          strokeWidth="2"
        />
      </g>

      {/* 3 · serviceTimes: the roof with the clock. */}
      <g className={styles.piece} data-on={on("serviceTimes")} data-piece="serviceTimes">
        <polygon
          points="116,164 240,98 364,164"
          className={painted ? "fill-primary" : "fill-border-strong"}
        />
        <circle
          cx="240"
          cy="138"
          r="15"
          className="fill-surface-raised stroke-text"
          strokeWidth="2"
        />
        <path d="M240 128v10l7 5" className="stroke-text" strokeWidth="2" fill="none" />
      </g>

      {/* 4 · contacts: the door and the windows. */}
      <g className={styles.piece} data-on={on("contacts")} data-piece="contacts">
        <path
          d="M224 238v-34a16 16 0 0 1 32 0v34z"
          className={painted ? "fill-accent" : "fill-muted"}
        />
        <rect x="152" y="184" width="20" height="30" rx="10" className="fill-info-soft" />
        <rect x="308" y="184" width="20" height="30" rx="10" className="fill-info-soft" />
        <circle cx="115" cy="160" r="8" className="fill-info-soft" />
      </g>

      {/* 5 · theme: the paint (the roof and the door take the site's colours, see above). */}
      <g className={styles.piece} data-on={on("theme")} data-piece="theme">
        <rect x="126" y="226" width="228" height="12" className="fill-primary-soft" />
        <rect x="96" y="226" width="38" height="12" className="fill-primary-soft" />
        <path d="M408 236h26l-4 14h-18z" className="fill-primary" />
        <path d="M413 236v-6h16v6" className="stroke-text" strokeWidth="2" fill="none" />
      </g>

      {/* 6 · preset: the steeple with the bell. */}
      <g className={styles.piece} data-on={on("preset")} data-piece="preset">
        <polygon
          points="94,120 115,72 136,120"
          className={painted ? "fill-primary" : "fill-text"}
        />
        <path d="M115 72V52M107 60h16" className="stroke-text" strokeWidth="3" fill="none" />
        <path d="M108 138a7 7 0 0 1 14 0v6h-14z" className="fill-accent" />
      </g>

      {/* 7 · draft: the flag on the ridge and the sparkles. */}
      <g className={styles.piece} data-on={on("draft")} data-piece="draft">
        <path d="M240 98V66" className="stroke-text" strokeWidth="3" />
        <path d="M240 66h30l-8 8 8 8h-30z" className="fill-accent" />
      </g>
      <g className={styles.sparkle}>
        <path d="M60 80l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" className="fill-accent" />
        <path d="M410 130l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="fill-accent" />
        <path d="M330 56l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="fill-primary" />
      </g>

      {/* The robots. */}
      <Robot x={30} y={190} variant="robotA" />
      <Robot x={386} y={192} variant="robotB" flip />
      <Robot x={204} y={196} variant="robotC" />
    </svg>
  );
}

function Robot({
  x,
  y,
  variant,
  flip = false,
}: {
  x: number;
  y: number;
  variant: "robotA" | "robotB" | "robotC";
  flip?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})${flip ? " scale(-1 1) translate(-44 0)" : ""}`}>
      <g className={cn(styles.robot, styles[variant])}>
        <path d="M22 8V0" className="stroke-text" strokeWidth="2" />
        <circle cx="22" cy="0" r="3" className="fill-accent" />
        <rect
          x="4"
          y="8"
          width="36"
          height="26"
          rx="7"
          className="fill-inverse stroke-text"
          strokeWidth="2"
        />
        <circle cx="15" cy="21" r="4" className="fill-accent" />
        <circle cx="29" cy="21" r="4" className="fill-accent" />
        <rect
          x="8"
          y="36"
          width="28"
          height="18"
          rx="4"
          className="fill-inverse-muted stroke-text"
          strokeWidth="2"
        />
        <rect x="11" y="54" width="8" height="8" rx="2" className="fill-text" />
        <rect x="25" y="54" width="8" height="8" rx="2" className="fill-text" />
        <g className={styles.arm}>
          <rect x="34" y="40" width="20" height="6" rx="3" className="fill-text" />
          <rect x="50" y="34" width="8" height="16" rx="2" className="fill-primary" />
        </g>
        <rect x="-2" y="40" width="8" height="6" rx="3" className="fill-text" />
      </g>
    </g>
  );
}

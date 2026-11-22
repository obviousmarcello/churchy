import type { ReactNode } from "react";
import type { HeroStyle } from "@churchy/themes";
import { cn } from "../cn";
import { Ornament } from "../ornament";
import { Container } from "./layout";

export interface HeroImage {
  src: string;
  /** Required. Use an empty string only for a purely decorative image. */
  alt: string;
  /** Intrinsic size: reserves the space so the hero never shifts the layout (CLS). */
  width: number;
  height: number;
  srcSet?: string;
  sizes?: string;
}

export interface HeroProps {
  variant: HeroStyle;
  title: string;
  lead?: string;
  /** Small line above the title (e.g. the parish name or a liturgical day). */
  eyebrow?: string;
  /** Buttons / links. */
  actions?: ReactNode;
  /** Required for the two image variants; ignored by `text-only`. */
  image?: HeroImage;
  /** Heading element; the first hero on a page is the `h1`. */
  headingLevel?: 1 | 2;
}

/*
 * Design v2: every hero is a large rounded panel inset from the page edges (8 px on phones, 12 px
 * from 40rem), so photos and bands get big soft corners instead of running edge to edge.
 */
const inset = "px-2 pt-2 sm:px-3 sm:pt-3";
const panel = "overflow-hidden rounded-[calc(var(--radius-xl)_+_0.5rem)]";

function HeroImg({ image, className }: { image: HeroImage; className?: string }) {
  return (
    <img
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      srcSet={image.srcSet}
      sizes={image.sizes}
      // The hero is the LCP element: fetch it first and never lazy-load it.
      fetchPriority="high"
      decoding="async"
      className={className}
    />
  );
}

/**
 * The home page hero in the three theme variants (FR-104):
 * `image-full` (photo behind the text), `image-split` (text beside the photo), `text-only`.
 */
export function Hero({
  variant,
  title,
  lead,
  eyebrow,
  actions,
  image,
  headingLevel = 1,
}: HeroProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  if (variant === "image-full" && image) {
    return (
      <section data-hero="image-full" className={inset}>
        <div className={cn(panel, "relative isolate bg-inverse")}>
          <HeroImg
            image={image}
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[75%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-linear-to-t from-black/80 via-black/45 to-black/25 sm:bg-linear-to-r sm:from-black/80 sm:via-black/50 sm:to-black/10"
          />
          <Container className="flex min-h-[26rem] flex-col justify-end py-10 sm:min-h-[30rem] sm:py-14 lg:min-h-[34rem] lg:py-20">
            <div className="max-w-2xl text-white">
              {eyebrow ? (
                <p className="mb-3 text-fs-2 font-semibold text-inverse-accent">{eyebrow}</p>
              ) : null}
              <Heading className="font-heading text-fs-8 leading-[1.04] [font-weight:var(--fw-heading)] text-balance">
                {title}
              </Heading>
              {lead ? (
                <p className="mt-4 max-w-[52ch] text-fs-4 leading-snug text-white/95">{lead}</p>
              ) : null}
              {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
            </div>
          </Container>
        </div>
      </section>
    );
  }

  if (variant === "image-split" && image) {
    return (
      <section data-hero="image-split" className={inset}>
        <div className={cn(panel, "bg-surface-sunken")}>
          <Container className="grid items-center gap-8 py-8 md:grid-cols-2 md:gap-12 lg:py-14">
            <div className="order-2 md:order-1">
              {eyebrow ? (
                <p className="mb-3 text-fs-2 font-semibold text-accent-text">{eyebrow}</p>
              ) : null}
              <Heading className="font-heading text-fs-8 leading-[1.04] [font-weight:var(--fw-heading)] text-primary">
                {title}
              </Heading>
              <Ornament className="mt-5" />
              {lead ? (
                <p className="mt-5 max-w-[46ch] text-fs-4 leading-snug text-text">{lead}</p>
              ) : null}
              {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
            </div>
            <div className="order-1 md:order-2">
              <HeroImg
                image={image}
                className="aspect-[4/3] w-full rounded-[calc(var(--radius-xl)_+_4px)] object-cover shadow-raised"
              />
            </div>
          </Container>
        </div>
      </section>
    );
  }

  // text-only, and the fallback when an image variant is rendered without an image.
  return (
    <section data-hero="text-only" className={inset}>
      <div className={cn(panel, "bg-surface-sunken")}>
        <Container className={cn("flex flex-col items-center py-14 text-center lg:py-20")}>
          <Ornament className="mb-6" />
          {eyebrow ? (
            <p className="mb-3 text-fs-2 font-semibold text-accent-text">{eyebrow}</p>
          ) : null}
          <Heading className="max-w-[18ch] font-heading text-fs-8 leading-[1.04] [font-weight:var(--fw-heading)] text-primary">
            {title}
          </Heading>
          {lead ? (
            <p className="mt-5 max-w-[52ch] text-fs-4 leading-snug text-text">{lead}</p>
          ) : null}
          {actions ? (
            <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
          ) : null}
        </Container>
      </div>
    </section>
  );
}

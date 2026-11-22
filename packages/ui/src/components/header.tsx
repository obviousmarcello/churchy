"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "../cn";
import { ChevronDownIcon, CloseIcon, MenuIcon } from "../icons";
import { Monogram } from "./brand";
import { buttonClasses } from "./button";

export interface NavItem {
  label: string;
  href: string;
  /** Marks the item of the current page (`aria-current="page"`). */
  current?: boolean;
  /** One level of sub-items; turns the item into a disclosure button + list. */
  children?: Array<{ label: string; href: string; current?: boolean }>;
}

export interface HeaderProps {
  brand: {
    name: string;
    href: string;
    /** Logo element (an `<img alt="">` or an SVG). Decorative: the name next to it is the label. */
    logo?: ReactNode;
    /**
     * Initials shown in a tinted tile when there is no `logo` (e.g. "ST" for Szent Tivadar).
     * Decorative: the name next to it is the label.
     */
    monogram?: string;
  };
  nav: NavItem[];
  /**
   * Prominent call-to-action, e.g. the next service: `caption` "Szeretettel várjuk" above the
   * `label` "vasárnap 10:00". `icon` is decorative. In the bar from 640 px; the last menu item
   * below that.
   */
  cta?: { label: string; href: string; caption?: string; icon?: ReactNode; "data-testid"?: string };
  labels: {
    /** Accessible name of the `<nav>` landmark. */
    navigation: string;
    /** Name of the toggle while the menu is closed. */
    openMenu: string;
    /** Name of the toggle while the menu is open. */
    closeMenu: string;
  };
  /** Sticky at the top of the viewport (default). Turn off for previews. */
  sticky?: boolean;
}

// Design v2: rounded pill items; the current page sits on a soft brand-tinted pill.
const linkBase =
  "relative flex w-full min-h-12 items-center rounded-[14px] px-3 text-fs-3 font-semibold text-text no-underline " +
  "transition-[background-color,color,scale] duration-(--dur-2) ease-standard hover:bg-hover hover:text-primary " +
  "active:scale-(--motion-press) aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary " +
  "lg:inline-flex lg:w-auto lg:min-h-11 lg:rounded-full lg:px-3.5 lg:text-fs-2 xl:text-fs-3";

/**
 * Site header: brand, primary navigation, optional call-to-action. Below 1024 px the navigation is
 * an accessible disclosure: the toggle has `aria-expanded`/`aria-controls`, Escape closes it and
 * returns focus to the toggle, and it closes when focus leaves the header or a link is followed.
 * Items with `children` are disclosure buttons themselves (same keyboard behaviour).
 */
export function Header({ brand, nav, cta, labels, sticky = true }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const subButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const closeAll = useCallback(() => {
    setOpen(false);
    setSubOpen(null);
  }, []);

  // Escape and outside pointer presses while anything is open.
  useEffect(() => {
    if (!open && subOpen === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (subOpen !== null) {
        subButtons.current[subOpen]?.focus();
        setSubOpen(null);
      } else {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeAll();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, subOpen, closeAll]);

  // Leaving the mobile layout (rotate, resize) resets the disclosure state.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !event.currentTarget.contains(next)) closeAll();
  };

  const onNavClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a")) closeAll();
  };

  return (
    <header
      ref={rootRef}
      onBlur={onBlur}
      className={cn(
        // Translucent app bar with backdrop blur where supported (cheap: one 56–72 px strip).
        "z-40 border-b border-hairline bg-surface-raised",
        "supports-[backdrop-filter:blur(1px)]:bg-surface-glass supports-[backdrop-filter:blur(1px)]:backdrop-blur-xl supports-[backdrop-filter:blur(1px)]:backdrop-saturate-150",
        sticky ? "sticky top-0" : "relative",
      )}
    >
      <div className="mx-auto flex min-h-(--header-h) w-full max-w-(--content-max) items-center gap-3 px-(--gutter)">
        <a
          href={brand.href}
          data-testid="site-brand"
          className="flex min-h-11 min-w-0 items-center gap-3 py-1 text-primary no-underline"
        >
          {brand.logo ? (
            <span className="shrink-0">{brand.logo}</span>
          ) : brand.monogram ? (
            <Monogram initials={brand.monogram} />
          ) : null}
          <span className="font-heading text-fs-4 leading-[1.1] [font-weight:var(--fw-heading-sm,var(--fw-heading))] tracking-(--heading-tracking) text-balance lg:text-fs-5">
            {brand.name}
          </span>
        </a>

        {cta ? (
          <a
            href={cta.href}
            data-testid={cta["data-testid"]}
            className="ml-auto hidden min-h-11 shrink-0 items-center gap-2.5 rounded-button bg-primary py-1.5 pr-4 pl-3 text-primary-contrast no-underline shadow-[0_6px_16px_-8px_var(--c-primary)] transition-[background-color,translate,scale] duration-(--dur-2) ease-spring hover:translate-y-(--motion-lift-sm) hover:bg-primary-hover active:scale-(--motion-press) sm:inline-flex lg:order-last lg:ml-3"
          >
            {cta.icon ? (
              <span aria-hidden="true" className="shrink-0 [&_svg]:size-5">
                {cta.icon}
              </span>
            ) : null}
            <span className="flex flex-col leading-tight">
              {cta.caption ? <span className="text-fs-1">{cta.caption}</span> : null}
              <span className="text-fs-2 font-semibold tabular-nums">{cta.label}</span>
            </span>
          </a>
        ) : null}

        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? labels.closeMenu : labels.openMenu}
          onClick={() => {
            setSubOpen(null);
            setOpen((value) => !value);
          }}
          className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-button bg-primary-soft sm:ml-0 text-primary transition-[background-color,scale] duration-(--dur-2) ease-spring hover:bg-[color-mix(in_oklab,var(--c-primary)_14%,var(--c-surface-raised))] active:scale-(--motion-press) lg:hidden"
        >
          {open ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>

        <nav
          id={menuId}
          aria-label={labels.navigation}
          onClick={onNavClick}
          className={cn(
            // Phones: a floating rounded panel that pops in under the bar.
            "absolute inset-x-2 top-[calc(100%_+_0.5rem)] max-h-[calc(100dvh-var(--header-h)-1rem)] origin-top overflow-y-auto rounded-overlay border border-hairline bg-surface-raised shadow-overlay",
            "motion-safe:animate-[ui-pop-in_var(--dur-3)_var(--ease-spring)] lg:animate-none",
            "lg:static lg:ml-auto lg:block lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none",
            open ? "block" : "hidden",
          )}
        >
          <ul className="mx-auto flex w-full max-w-(--content-max) flex-col gap-0.5 p-2 lg:flex-row lg:items-center lg:gap-0.5 lg:p-0">
            {nav.map((item, index) => (
              <li key={item.href + item.label} className="lg:relative">
                {item.children?.length ? (
                  <>
                    <button
                      ref={(el) => {
                        subButtons.current[index] = el;
                      }}
                      type="button"
                      aria-expanded={subOpen === index}
                      aria-controls={`${menuId}-sub-${index}`}
                      onClick={() => setSubOpen(subOpen === index ? null : index)}
                      className={cn(linkBase, "cursor-pointer justify-between gap-1 text-left")}
                    >
                      {item.label}
                      <ChevronDownIcon
                        className={cn(
                          "size-5 shrink-0 transition-transform duration-(--duration)",
                          subOpen === index && "rotate-180",
                        )}
                      />
                    </button>
                    <ul
                      id={`${menuId}-sub-${index}`}
                      hidden={subOpen !== index}
                      className="mb-1 ml-3 grid gap-0.5 border-l-2 border-accent/60 pl-2 lg:absolute lg:top-full lg:left-0 lg:z-10 lg:mt-2 lg:mb-0 lg:ml-0 lg:min-w-60 lg:origin-top-left lg:rounded-[20px] lg:border lg:border-hairline lg:bg-surface-raised lg:p-2 lg:shadow-overlay lg:motion-safe:animate-[ui-pop-in_var(--dur-3)_var(--ease-spring)]"
                    >
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <a
                            href={child.href}
                            aria-current={child.current ? "page" : undefined}
                            className="flex min-h-11 items-center rounded-[12px] px-3 text-fs-3 font-medium text-text no-underline transition-colors duration-(--dur-2) hover:bg-primary-soft hover:text-primary aria-[current=page]:font-bold aria-[current=page]:text-primary"
                          >
                            {child.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <a
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    className={linkBase}
                  >
                    {item.label}
                  </a>
                )}
              </li>
            ))}
            {cta ? (
              // Below 640 px the call-to-action lives in the menu (the bar has no room for it).
              <li className="p-1 pt-2 sm:hidden">
                <a
                  href={cta.href}
                  className={buttonClasses({ variant: "primary", className: "w-full" })}
                >
                  {cta.caption ? `${cta.caption}: ${cta.label}` : cta.label}
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}

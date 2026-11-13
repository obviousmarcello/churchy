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
  };
  nav: NavItem[];
  /** Prominent call-to-action, e.g. the "Támogatás" button. */
  cta?: { label: string; href: string };
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

const linkBase =
  "relative flex w-full min-h-12 items-center px-1 text-fs-3 font-semibold text-text no-underline " +
  "transition-colors duration-(--duration) hover:text-primary aria-[current=page]:text-primary " +
  "lg:inline-flex lg:w-auto lg:min-h-11 lg:px-3 lg:text-fs-2 xl:text-fs-3 " +
  "lg:after:absolute lg:after:inset-x-3 lg:after:bottom-1 lg:after:h-0.5 lg:after:origin-left " +
  "lg:after:scale-x-0 lg:after:bg-accent lg:after:transition-transform " +
  "lg:hover:after:scale-x-100 lg:aria-[current=page]:after:scale-x-100";

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
        "z-40 border-t-4 border-t-primary border-b border-b-border bg-surface-raised",
        sticky ? "sticky top-0" : "relative",
      )}
    >
      <div className="mx-auto flex min-h-(--header-h) w-full max-w-(--content-max) items-center gap-3 px-(--gutter)">
        <a
          href={brand.href}
          className="flex min-h-11 min-w-0 items-center gap-3 py-1 text-primary no-underline"
        >
          {brand.logo ? <span className="shrink-0">{brand.logo}</span> : null}
          <span className="font-heading text-fs-4 leading-[1.05] font-bold lg:text-fs-5">
            {brand.name}
          </span>
        </a>

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
          className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-md border-2 border-border-strong text-primary hover:bg-primary-soft lg:hidden"
        >
          {open ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
        </button>

        <nav
          id={menuId}
          aria-label={labels.navigation}
          onClick={onNavClick}
          className={cn(
            "absolute inset-x-0 top-full max-h-[calc(100dvh-var(--header-h))] overflow-y-auto border-b border-border bg-surface-raised shadow-raised",
            "lg:static lg:ml-auto lg:block lg:max-h-none lg:overflow-visible lg:border-0 lg:bg-transparent lg:shadow-none",
            open ? "block" : "hidden",
          )}
        >
          <ul className="mx-auto flex w-full max-w-(--content-max) flex-col px-(--gutter) py-2 lg:flex-row lg:items-center lg:gap-0.5 lg:p-0">
            {nav.map((item, index) => (
              <li
                key={item.href + item.label}
                className="border-b border-border/70 last:border-b-0 lg:relative lg:border-0"
              >
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
                      className="mb-2 ml-3 border-l-2 border-accent pl-3 lg:absolute lg:top-full lg:left-0 lg:z-10 lg:mt-1 lg:mb-0 lg:ml-0 lg:min-w-60 lg:rounded-md lg:border lg:border-l-2 lg:border-border lg:border-l-accent lg:bg-surface-raised lg:p-2 lg:shadow-raised"
                    >
                      {item.children.map((child) => (
                        <li key={child.href}>
                          <a
                            href={child.href}
                            aria-current={child.current ? "page" : undefined}
                            className="flex min-h-11 items-center rounded-sm px-2 text-fs-3 font-medium text-text no-underline hover:bg-primary-soft hover:text-primary aria-[current=page]:font-bold aria-[current=page]:text-primary"
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
              <li className="pt-3 pb-3 lg:ml-3 lg:py-0">
                <a
                  href={cta.href}
                  className={buttonClasses({ variant: "primary", className: "w-full lg:w-auto" })}
                >
                  {cta.label}
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
      </div>
    </header>
  );
}

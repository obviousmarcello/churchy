"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";
import { tabCurrentClass, tabListClass, tabTriggerClass, TabLabel } from "./tab-styles";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  /** Count shown after the label (e.g. open requests). Part of the accessible name. */
  count?: number;
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}

/**
 * Tabs on Radix (roving tabindex, arrow keys, Home/End). The raised thumb slides to the active tab
 * (measured after layout; before hydration the active tab draws its own thumb, so nothing jumps).
 * The panel fades in on change.
 */
export function Tabs({ label, tabs, defaultValue, value, onValueChange, className }: TabsProps) {
  const initial = defaultValue ?? tabs[0]?.value;
  const [current, setCurrent] = useState(value ?? initial);
  const active = value ?? current;
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  // Panels fade in only after the user switches tabs, never on page load.
  const [switched, setSwitched] = useState(false);

  const measure = useCallback(() => {
    const list = listRef.current;
    const trigger = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!list || !trigger) return;
    setIndicator({ x: trigger.offsetLeft, w: trigger.offsetWidth });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [active, measure, tabs.length]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <RadixTabs.Root
      {...(value === undefined ? { defaultValue: initial } : { value })}
      onValueChange={(next) => {
        setCurrent(next);
        setSwitched(true);
        onValueChange?.(next);
      }}
      className={cn("min-w-0", className)}
    >
      <RadixTabs.List
        ref={listRef}
        aria-label={label}
        data-indicator={indicator ? "ready" : undefined}
        className={cn(tabListClass, "group/tabs")}
      >
        {indicator ? (
          <span
            aria-hidden="true"
            data-tab-indicator=""
            style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }}
            className={cn(
              "pointer-events-none absolute top-1 bottom-1 left-0 rounded-[max(calc(var(--radius-button)_-_4px),6px)]",
              "bg-surface-raised shadow-card transition-[transform,width] duration-(--dur-3) ease-spring",
            )}
          />
        ) : null}
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              tabTriggerClass,
              "data-[state=active]:text-text group-data-[indicator=ready]/tabs:data-[state=active]:hover:bg-transparent",
              // Until the sliding thumb is measured, the active tab draws its own.
              tab.value === active && !indicator && tabCurrentClass,
            )}
          >
            <TabLabel label={tab.label} icon={tab.icon} count={tab.count} />
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content
          key={tab.value}
          value={tab.value}
          className={cn(
            "pt-6",
            switched &&
              "[--motion-rise:6px] motion-safe:data-[state=active]:animate-[ui-fade-up_var(--dur-3)_var(--ease-emphasized)]",
          )}
        >
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../cn";

export interface TabItem {
  value: string;
  label: string;
  content: ReactNode;
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

/** Tabs on Radix (roving tabindex, arrow keys, Home/End). */
export function Tabs({ label, tabs, defaultValue, value, onValueChange, className }: TabsProps) {
  const initial = defaultValue ?? tabs[0]?.value;
  return (
    <RadixTabs.Root
      {...(value === undefined ? { defaultValue: initial } : { value })}
      onValueChange={onValueChange}
      className={cn("min-w-0", className)}
    >
      <RadixTabs.List
        aria-label={label}
        className="flex gap-1 overflow-x-auto border-b-2 border-border"
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              "-mb-0.5 min-h-(--control-h-md) shrink-0 cursor-pointer border-b-[3px] border-transparent px-5",
              "text-fs-3 font-semibold text-muted transition-colors duration-(--duration)",
              "hover:text-primary data-[state=active]:border-primary data-[state=active]:text-primary",
            )}
          >
            {tab.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="pt-5">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../cn";
import { tabListClass, tabTriggerClass, TabLabel } from "./tab-styles";

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

/** Tabs on Radix (roving tabindex, arrow keys, Home/End). */
export function Tabs({ label, tabs, defaultValue, value, onValueChange, className }: TabsProps) {
  const initial = defaultValue ?? tabs[0]?.value;
  return (
    <RadixTabs.Root
      {...(value === undefined ? { defaultValue: initial } : { value })}
      onValueChange={onValueChange}
      className={cn("min-w-0", className)}
    >
      <RadixTabs.List aria-label={label} className={tabListClass}>
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              tabTriggerClass,
              "data-[state=active]:border-primary data-[state=active]:text-text",
            )}
          >
            <TabLabel label={tab.label} icon={tab.icon} count={tab.count} />
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.map((tab) => (
        <RadixTabs.Content key={tab.value} value={tab.value} className="pt-6">
          {tab.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

"use client";

import { createContext, useContext, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn";

const PortalContainerContext = createContext<HTMLElement | null>(null);

/** The element overlays (dialogs) should portal into so they inherit the surrounding variant. */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

export interface AdminScopeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Switches every component inside to the admin / workspace variant (SDD 11.2): high contrast,
 * sans-serif headings and controls of at least 44 px. Wrap the admin shell once; it ignores the
 * tenant's public theme colours on purpose. Dialogs rendered inside portal back into this element so
 * they keep the variant.
 */
export function AdminScope({ className, children, ...rest }: AdminScopeProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  return (
    <div
      data-ui="admin"
      ref={setElement}
      className={cn("bg-surface text-text", className)}
      {...rest}
    >
      <PortalContainerContext.Provider value={element}>{children}</PortalContainerContext.Provider>
    </div>
  );
}

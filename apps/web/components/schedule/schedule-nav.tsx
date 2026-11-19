"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@churchy/ui";
import { useT } from "@/i18n/client";

const BASE = "/admin/rend";
const PARTS = [
  { id: "weekly", href: BASE },
  { id: "exceptions", href: `${BASE}/kivetel` },
] as const;

/** Links between the two schedule screens (weekly rules, exceptions); marks the current one. */
export function ScheduleNav() {
  const t = useT("admin.schedule.tabs");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="mt-4 border-b-2 border-border">
      <ul className="-mb-0.5 flex flex-wrap gap-x-1">
        {PARTS.map(({ id, href }) => {
          const current = pathname === href;
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-4 px-4 font-semibold no-underline",
                  current
                    ? "border-primary text-primary"
                    : "border-transparent text-text hover:border-border-strong",
                )}
              >
                {t(id)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

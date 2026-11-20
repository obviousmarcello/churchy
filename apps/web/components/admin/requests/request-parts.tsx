import Link from "next/link";
import { Badge, type BadgeTone } from "@churchy/ui";
import type { RequestStatus } from "@churchy/contracts";
import { getT } from "@/i18n/server";

const tones: Record<RequestStatus, BadgeTone> = {
  uj: "info",
  folyamatban: "warning",
  lezart: "neutral",
};

/** *Új* / *Folyamatban* / *Lezárt* as a labelled badge. */
export async function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const t = await getT("admin.requests.status");
  return (
    <Badge tone={tones[status]} data-status={status} data-testid="request-status">
      {t(status)}
    </Badge>
  );
}

/** The two screens of the section: inbox and form builder. */
export async function RequestsTabs({ current }: { current: "inbox" | "forms" }) {
  const t = await getT("admin.requests.tabs");
  const tabs = [
    { id: "inbox", href: "/admin/kerelmek", label: t("inbox") },
    { id: "forms", href: "/admin/kerelmek/urlapok", label: t("forms") },
  ] as const;
  return (
    <nav aria-label={t("label")} data-testid="requests-tabs">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              aria-current={tab.id === current ? "page" : undefined}
              className={
                "inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold " +
                (tab.id === current
                  ? "border-primary bg-primary text-primary-contrast"
                  : "border-border-strong text-primary")
              }
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

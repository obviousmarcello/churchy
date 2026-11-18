import Link from "next/link";
import { Alert, Badge, Button, Input, Select, type BadgeTone } from "@churchy/ui";
import { getT } from "@/i18n/server";
import type { PublishState } from "@/lib/admin/content";

const tones: Record<PublishState | "cancelled", BadgeTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  expired: "warning",
  cancelled: "danger",
};

/** Draft / scheduled / published / expired / cancelled as a labelled badge. */
export async function StateBadge({ state }: { state: PublishState | "cancelled" }) {
  const t = await getT("admin.content.states");
  return (
    <Badge tone={tones[state]} data-state={state} data-testid="state-badge">
      {t(state)}
    </Badge>
  );
}

/**
 * Search (and optionally state) filter of a list screen: a plain GET form, so the filtered list
 * is a link that can be shared and works without scripts.
 */
export async function ListFilters({
  q,
  state,
  withState = true,
  states: stateOptions = ["draft", "scheduled", "published"],
  action,
}: {
  q: string;
  state?: string;
  withState?: boolean;
  /** The states offered in the filter (events have no *scheduled*, but *cancelled*). */
  states?: readonly ("draft" | "scheduled" | "published" | "cancelled")[];
  /** Path of the list, for the reset link. */
  action: string;
}) {
  const t = await getT("admin.content.list");
  const states = await getT("admin.content.states");
  return (
    <form
      method="get"
      role="search"
      aria-label={t("filters")}
      className="flex flex-wrap items-end gap-4"
      data-testid="list-filters"
    >
      <Input
        type="search"
        name="q"
        label={t("searchLabel")}
        defaultValue={q}
        wrapperClassName="min-w-64 flex-1"
      />
      {withState ? (
        <Select
          name="allapot"
          label={t("status")}
          defaultValue={state ?? ""}
          options={[
            { value: "", label: t("allStatuses") },
            ...stateOptions.map((s) => ({ value: s, label: states(s) })),
          ]}
          wrapperClassName="min-w-48"
        />
      ) : null}
      <Button type="submit" variant="secondary">
        {t("filter")}
      </Button>
      {q !== "" || (state ?? "") !== "" ? (
        <Link
          href={action}
          className="inline-flex min-h-11 items-center px-2 font-semibold text-primary"
        >
          {t("reset")}
        </Link>
      ) : null}
    </form>
  );
}

/** Shown on an edit screen right after a successful save (`?mentve=1`). */
export async function SavedNotice({ saved }: { saved: boolean }) {
  if (!saved) return null;
  const t = await getT("admin.content.form");
  return (
    <div role="status" data-testid="saved-notice">
      <Alert tone="success" title={t("savedTitle")}>
        <p>{t("savedBody")}</p>
      </Alert>
    </div>
  );
}

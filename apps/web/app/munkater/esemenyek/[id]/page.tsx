import type { Metadata } from "next";
import Link from "next/link";

import { MusicModulesProvider } from "@/components/music/app-config";
import { getI18n } from "@/i18n/music/server";
import { requireEventsPageUser } from "@/server/music/auth";
import { canServer } from "@/lib/permissions/server";
import { getMemberEnv } from "@/server/workspace";
import { loadEventPage } from "../editor/data";
import { EventView } from "../editor/event-view";
import { PlanLink } from "./plan-link";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.detail.title, robots: { index: false, follow: false } };
}

// The event page: the copy of Music Sheet DB's event page (`../editor/*`), with the data resolved on
// the server per request. Churchy's plan link sits below it (the plan side is Churchy's).
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { m }] = await Promise.all([params, getI18n(), requireEventsPageUser()]);
  const result = await loadEventPage(id);
  const modules = "transient" in result ? result.transient.modules : {};
  const scripture = "transient" in result ? result.transient.scripture : undefined;
  const plan = "data" in result ? await planOf(id) : null;
  return (
    <main className="flex flex-1 flex-col">
      {/* Small screens have the back link in the header of the view; large screens have the summary only. */}
      <Link
        href="/munkater/esemenyek"
        className="hidden px-6 pt-4 text-sm text-muted underline lg:block"
      >
        {m.events.title}
      </Link>
      <MusicModulesProvider modules={modules} scripture={scripture}>
        <EventView result={result} />
      </MusicModulesProvider>
      {plan && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-6">
          <PlanLink eventId={id} planId={plan.planId} canCreate={plan.canCreate} />
        </div>
      )}
    </main>
  );
}

/** The liturgy plan of the event, and whether the viewer may make one (the plan side is Churchy's). */
async function planOf(eventId: string): Promise<{ planId: string | null; canCreate: boolean }> {
  try {
    const { repos, ctx } = await getMemberEnv();
    const plans = await repos.servicePlans.list(ctx, { eventIds: [eventId] });
    const tenantId = ctx.tenantId;
    return {
      planId: plans[0]?.id ?? null,
      canCreate: tenantId !== undefined && (await canServer("servicePlan.edit", { tenantId })),
    };
  } catch {
    return { planId: null, canCreate: false };
  }
}

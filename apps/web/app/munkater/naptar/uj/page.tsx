import { notFound } from "next/navigation";
import { EntityForm } from "@/components/admin/content/entity-form";
import { getT } from "@/i18n/server";
import { creatableVisibilities } from "@/lib/workspace/event-access";
import { createWorkspaceEvent } from "@/server/workspace-event-actions";
import { eventFormFields, eventFormValues } from "@/server/workspace-event-form";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.event"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** New internal event (D-57): the form only offers what `can()` lets the actor create. */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspaceModule("ws.calendar");
  const [env, t, form, query] = await Promise.all([
    getMemberEnv(),
    getT("munkater.event"),
    getT("admin.content.form"),
    searchParams,
  ]);
  if (creatableVisibilities(env.actor, env.tenantId, null).length === 0) notFound();
  const date =
    typeof query["datum"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query["datum"])
      ? query["datum"]
      : null;
  return (
    <div className="flex flex-col gap-5" data-testid="workspace-event-new">
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
        {t("newTitle")}
      </h1>
      <EntityForm
        action={createWorkspaceEvent}
        fields={await eventFormFields(env)}
        values={await eventFormValues(env, undefined, date)}
        submitLabel={form("save")}
        cancelHref="/munkater/naptar"
        testId="event-form"
      />
    </div>
  );
}

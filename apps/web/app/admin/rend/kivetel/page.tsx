import { SectionPlaceholder } from "@/components/admin";
import { getT } from "@/i18n/server";

export async function generateMetadata() {
  const [flow, common] = await Promise.all([getT("admin.flows"), getT("common")]);
  return {
    title: `${flow("scheduleException")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Placeholder of the flow reached from the dashboard quick actions (D-18 AC2). */
export default async function Page() {
  const flow = await getT("admin.flows");
  return <SectionPlaceholder section="schedule" flow={flow("scheduleException")} />;
}

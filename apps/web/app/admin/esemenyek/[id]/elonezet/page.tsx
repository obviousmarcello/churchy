import { notFound } from "next/navigation";
import { budapestDate, dayWindow, expandEvents, richTextParagraphs } from "@churchy/events";
import { addDays } from "@churchy/hu";
import { Address } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { PreviewFrame } from "@/components/admin/content/preview-frame";
import { OccurrenceBadges, OccurrenceWhen } from "@/components/events/event-parts";
import { getT } from "@/i18n/server";
import { huAddress } from "@/lib/events/public-event";
import { adminData, mayOpen } from "@/server/content-admin";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.content.preview"), getT("common")]);
  return {
    title: `${t("title")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Preview of a (draft) event with the public template's parts (D-20). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nav, preview, t] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.preview"),
    getT("public.events"),
  ]);
  const label = nav("sections.events");
  if (!(await mayOpen("events"))) return <AdminPage title={label} section="events" />;
  const { ctx, repos } = await adminData();
  const event = await repos.events.get(ctx, id);
  if (event === null) notFound();

  const date = budapestDate(event.startsAt);
  const occurrence = expandEvents([event], dayWindow(addDays(date, -1), addDays(date, 60)))[0];
  const location = event.locationId ? await repos.locations.get(ctx, event.locationId) : null;
  const address = location ? huAddress(location) : null;
  const paragraphs = event.body ? richTextParagraphs(event.body) : [];

  return (
    <PreviewFrame
      title={event.title}
      section="events"
      editHref={`/admin/esemenyek/${id}`}
      breadcrumbs={[
        { label, href: "/admin/esemenyek" },
        { label: event.title, href: `/admin/esemenyek/${id}` },
        { label: preview("title") },
      ]}
    >
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {event.title}
        </h1>
        {occurrence ? <OccurrenceBadges occ={occurrence} category={event.category} /> : null}
      </header>
      <section
        aria-labelledby="preview-when"
        className="flex max-w-prose flex-col gap-2 rounded-lg border border-border bg-surface-raised p-5 shadow-card"
      >
        <h2 id="preview-when" className="font-heading text-fs-4 font-bold">
          {t("whenHeading")}
        </h2>
        {occurrence ? <OccurrenceWhen occ={occurrence} className="text-fs-4" /> : null}
        {location ? (
          <p className="text-fs-3">
            <strong>{location.name}</strong>
            {address ? (
              <>
                {", "}
                <Address address={address} />
              </>
            ) : null}
          </p>
        ) : null}
      </section>
      {paragraphs.map((p, i) => (
        <p key={i} className="max-w-prose text-fs-4">
          {p}
        </p>
      ))}
    </PreviewFrame>
  );
}

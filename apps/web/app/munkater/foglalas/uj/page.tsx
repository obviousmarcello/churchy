import { notFound } from "next/navigation";
import { isoWeekday } from "@churchy/hu";
import { seriesHorizon } from "@churchy/booking";
import { BookingForm } from "@/components/rooms/booking-form";
import { getT } from "@/i18n/server";
import type { BookingFormInput } from "@/lib/rooms/types";
import { checkBooking, createBooking } from "@/server/room-actions";
import { loadRoomViews } from "@/server/rooms";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms.form"), getT("common")]);
  return {
    title: `${t("newTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

/** New booking (D-60/D-61): phone-first form with the live conflict check. */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, query] = await Promise.all([
    getMemberEnv(),
    getT("munkater.rooms.form"),
    searchParams,
  ]);
  const views = (await loadRoomViews(env)).filter((v) => v.canBook);
  if (views.length === 0) notFound();
  const wanted = one(query["terem"]);
  const room = views.find((v) => v.room.id === wanted) ?? views[0]!;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(query["datum"])) ? one(query["datum"]) : env.today;
  const horizon = seriesHorizon(env.today);
  const initial: BookingFormInput = {
    roomId: room.room.id,
    date,
    startTime: "18:00",
    endTime: "19:00",
    title: "",
    purpose: "",
    attendees: "",
    setupNotes: "",
    teamId: "",
    repeat: "none",
    weekdays: [isoWeekday(date)],
    until: horizon,
    skipConflicts: false,
  };
  const teamIds = new Set(env.me?.memberTeamIds ?? []);
  const teams = (await env.repos.teams.list(env.ctx)).filter((x) => teamIds.has(x.id));
  return (
    <div className="flex flex-col gap-4" data-testid="booking-new">
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
        {t("newTitle")}
      </h1>
      <BookingForm
        rooms={views.map((v) => ({ id: v.room.id, name: v.room.name, capacity: v.room.capacity }))}
        teams={teams.map((x) => ({ id: x.id, name: x.name }))}
        initial={initial}
        horizon={horizon}
        check={checkBooking}
        submit={createBooking}
      />
    </div>
  );
}

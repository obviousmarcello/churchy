import { notFound } from "next/navigation";
import { localParts } from "@churchy/booking";
import { can } from "@churchy/policy";
import { Badge, FormattedDate, FormattedTime } from "@churchy/ui";
import { DecideButtons } from "@/components/rooms/decide-buttons";
import { EditBooking } from "@/components/rooms/edit-booking";
import { getT } from "@/i18n/server";
import { cancelBooking, decideBooking, updateBooking } from "@/server/room-actions";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms.detail"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** One booking (D-60): details, approval, edit and cancel (this / following / all). */
export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [env, t, r] = await Promise.all([
    getMemberEnv(),
    getT("munkater.rooms.detail"),
    getT("munkater.rooms"),
  ]);
  const booking = await env.repos.bookings.get(env.ctx, id);
  if (booking === null) notFound();
  const room = await env.repos.rooms.get(env.ctx, booking.roomId);
  if (room === null) notFound();
  const approver = can(env.actor, "booking.approve", { tenantId: env.tenantId, roomId: room.id });
  const mine =
    booking.requestedByPersonId !== null && booking.requestedByPersonId === env.ctx.actor.personId;
  const editable =
    booking.source === "user" &&
    (mine || approver) &&
    booking.status !== "cancelled" &&
    booking.status !== "rejected";
  const start = localParts(booking.startsAt);
  const end = localParts(booking.endsAt);
  const requester = booking.requestedByPersonId
    ? await env.repos.people.get(env.ctx, booking.requestedByPersonId)
    : null;

  return (
    <div className="flex flex-col gap-4" data-testid="booking-detail">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {booking.title}
        </h1>
        <p className="text-fs-4 text-muted">
          {room.name} · <FormattedDate value={booking.startsAt} />{" "}
          <FormattedTime value={booking.startsAt} />–
          <FormattedTime value={booking.endsAt} />
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge
            tone={
              booking.status === "approved"
                ? "success"
                : booking.status === "pending"
                  ? "warning"
                  : "neutral"
            }
          >
            {r(`status.${booking.status}`)}
          </Badge>
          {booking.source === "service" ? <Badge tone="info">{r("board.service")}</Badge> : null}
          {booking.seriesId ? <Badge tone="info">{t("recurring")}</Badge> : null}
        </div>
        {requester ? (
          <p className="text-fs-2">
            {t("requestedBy", { name: `${requester.familyName} ${requester.givenName}` })}
          </p>
        ) : null}
        {booking.purpose ? <p>{booking.purpose}</p> : null}
        {booking.attendees ? <p>{t("attendees", { count: booking.attendees })}</p> : null}
        {booking.setupNotes ? <p>{t("setup", { notes: booking.setupNotes })}</p> : null}
      </header>
      {booking.status === "pending" && approver ? (
        <DecideButtons id={booking.id} name={booking.title} decide={decideBooking} />
      ) : null}
      {editable ? (
        <section aria-labelledby="edit-h" className="flex flex-col gap-3">
          <h2 id="edit-h" className="font-heading text-fs-5 font-bold">
            {t("editHeading")}
          </h2>
          <EditBooking
            id={booking.id}
            inSeries={booking.seriesId !== null}
            initial={{
              date: start.date,
              startTime: start.time,
              endTime: end.time,
              title: booking.title,
              purpose: booking.purpose ?? "",
              attendees: booking.attendees ? String(booking.attendees) : "",
              setupNotes: booking.setupNotes ?? "",
            }}
            update={updateBooking}
            cancel={cancelBooking}
          />
        </section>
      ) : null}
    </div>
  );
}

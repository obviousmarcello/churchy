import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, FormattedDate, FormattedTime, Stagger } from "@churchy/ui";
import { DecideButtons } from "@/components/rooms/decide-buttons";
import { getT } from "@/i18n/server";
import { decideBooking } from "@/server/room-actions";
import { loadRoomViews } from "@/server/rooms";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms.approvals"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Jóváhagyás* (D-60): pending requests of the rooms the actor may approve, and service clashes. */
export default async function RoomApprovalsPage() {
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.rooms.approvals")]);
  const views = await loadRoomViews(env);
  const approvable = new Map(
    views.filter((v) => v.canApprove).map((v) => [v.room.id, v.room.name]),
  );
  if (approvable.size === 0) notFound();
  const [rows, conflicts, people] = await Promise.all([
    env.repos.bookings.list(env.ctx, {
      from: "2000-01-01T00:00:00Z",
      to: "2100-01-01T00:00:00Z",
      statuses: ["pending"],
    }),
    env.repos.bookings.listServiceConflicts(env.ctx),
    env.repos.people.list(env.ctx),
  ]);
  const pending = rows.filter((b) => approvable.has(b.roomId));
  const names = new Map(people.map((p) => [p.id, `${p.familyName} ${p.givenName}`]));
  const clashing = new Map<string, (typeof rows)[number]>();
  for (const c of conflicts) {
    const b = await env.repos.bookings.get(env.ctx, c.bookingId);
    if (b && approvable.has(b.roomId)) clashing.set(b.id, b);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="room-approvals">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      {pending.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <Stagger as="ul" className="flex flex-col gap-3">
          {pending.map((b) => (
            <li
              key={b.id}
              className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
              data-testid="pending-booking"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/munkater/foglalas/${b.id}`}
                  className="font-heading text-fs-5 font-bold text-primary"
                >
                  {b.title}
                </Link>
                <Badge tone="warning">{t("pending")}</Badge>
              </div>
              <p className="text-muted">
                {approvable.get(b.roomId)} · <FormattedDate value={b.startsAt} format="short" />{" "}
                <FormattedTime value={b.startsAt} />–<FormattedTime value={b.endsAt} />
                {b.requestedByPersonId ? ` · ${names.get(b.requestedByPersonId) ?? ""}` : ""}
              </p>
              {b.purpose ? <p>{b.purpose}</p> : null}
              {b.holdExpiresAt ? (
                <p className="text-fs-2 text-muted">
                  {t("holdUntil")} <FormattedDate value={b.holdExpiresAt} format="short" />{" "}
                  <FormattedTime value={b.holdExpiresAt} />
                </p>
              ) : null}
              <DecideButtons id={b.id} name={b.title} decide={decideBooking} />
            </li>
          ))}
        </Stagger>
      )}
      {clashing.size > 0 ? (
        <section aria-labelledby="clash-h" data-testid="service-conflicts">
          <h2 id="clash-h" className="font-heading text-fs-5 font-bold">
            {t("clashesTitle")}
          </h2>
          <Alert tone="warning" title={t("clashesNote")} />
          <ul className="mt-2 flex flex-col gap-1">
            {[...clashing.values()].map((b) => (
              <li key={b.id}>
                <Link href={`/munkater/foglalas/${b.id}`} className="font-semibold text-primary">
                  {b.title}
                </Link>{" "}
                – {approvable.get(b.roomId)}, <FormattedDate value={b.startsAt} format="short" />{" "}
                <FormattedTime value={b.startsAt} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

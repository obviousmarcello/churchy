import Link from "next/link";
import { addDays } from "@churchy/hu";
import { EmptyState, Badge, ButtonLink, FormattedDate, FormattedTime, Stagger } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { dayBlocks, dayTicks } from "@/lib/rooms/day";
import { loadOccupancy, loadRoomViews } from "@/server/rooms";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const linkClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-button border border-hairline bg-surface-raised px-4 font-semibold text-text no-underline shadow-xs transition-[background-color,scale] duration-(--dur-2) ease-spring hover:bg-primary-soft active:scale-(--motion-press)";

/** *Foglaltság* (D-60): the day's availability of every room, with the service blocks. */
export default async function RoomsBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, query] = await Promise.all([getMemberEnv(), getT("munkater.rooms"), searchParams]);
  const raw = query["datum"];
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : env.today;
  const [views, { occupancies }] = await Promise.all([
    loadRoomViews(env),
    loadOccupancy(env, date, date),
  ]);
  const ticks = dayTicks();

  return (
    <div className="flex flex-col gap-4" data-testid="rooms-board">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("board.lead")}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`?datum=${addDays(date, -1)}`} className={linkClass} rel="prev">
          {t("board.previous")}
        </Link>
        <Link href={`?datum=${env.today}`} className={linkClass}>
          {t("board.today")}
        </Link>
        <Link href={`?datum=${addDays(date, 1)}`} className={linkClass} rel="next">
          {t("board.next")}
        </Link>
        <form method="get" className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="board-date">
            {t("board.pickDate")}
          </label>
          <input
            id="board-date"
            type="date"
            name="datum"
            defaultValue={date}
            className="min-h-11 rounded-control border border-border-strong bg-surface-raised px-3"
          />
          <button type="submit" className={linkClass}>
            {t("board.show")}
          </button>
        </form>
      </div>
      <h2 className="font-heading text-fs-5 font-bold" data-testid="board-date">
        <FormattedDate value={date} />
      </h2>

      {views.length === 0 ? <EmptyState size="sm" title={t("empty")} /> : null}
      <Stagger as="ul" className="flex flex-col gap-3">
        {views.map(({ room, locationName, canBook }) => {
          const blocks = dayBlocks(occupancies, room.id, date);
          return (
            <li
              key={room.id}
              className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
              data-testid="board-room"
              data-room={room.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-fs-5 font-bold">{room.name}</h3>
                <span className="text-muted">{locationName}</span>
                {room.capacity ? (
                  <Badge>{t("capacity", { count: room.capacity })}</Badge>
                ) : (
                  <Badge>{t("resource")}</Badge>
                )}
                {canBook ? (
                  <ButtonLink
                    href={`/munkater/foglalas/uj?terem=${room.id}&datum=${date}`}
                    size="sm"
                    className="ml-auto"
                  >
                    {t("board.book")}
                  </ButtonLink>
                ) : null}
              </div>
              <div aria-hidden="true" className="relative h-8 rounded-control bg-success-soft">
                {blocks.map((b) => (
                  <span
                    key={b.occupancy.id}
                    className={`absolute inset-y-0 rounded-control ${
                      b.occupancy.source === "service"
                        ? "bg-primary"
                        : b.occupancy.status === "pending"
                          ? "bg-warning"
                          : "bg-danger"
                    }`}
                    style={{ left: `${b.left}%`, width: `${b.width}%` }}
                  />
                ))}
              </div>
              <div aria-hidden="true" className="relative h-4 text-fs-1 text-muted">
                {ticks.map((tick) => (
                  <span
                    key={tick.hour}
                    className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.hour}
                  </span>
                ))}
              </div>
              {blocks.length === 0 ? (
                <p className="text-fs-2 text-success" data-testid="room-free">
                  {t("board.freeAllDay")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1" data-testid="room-busy">
                  {blocks.map((b) => (
                    <li
                      key={b.occupancy.id}
                      className="flex flex-wrap items-center gap-x-2 text-fs-2"
                    >
                      <span className="font-semibold">
                        <FormattedTime value={b.occupancy.startsAt} />–
                        <FormattedTime value={b.occupancy.endsAt} />
                      </span>
                      {b.occupancy.source === "service" ? (
                        <span>{b.occupancy.title}</span>
                      ) : (
                        <Link
                          href={`/munkater/foglalas/${b.occupancy.id}`}
                          className="text-primary"
                        >
                          {b.occupancy.title}
                        </Link>
                      )}
                      {b.occupancy.source === "service" ? (
                        <Badge tone="info">{t("board.service")}</Badge>
                      ) : null}
                      {b.occupancy.status === "pending" ? (
                        <Badge tone="warning">{t("status.pending")}</Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </Stagger>
      <ul className="flex flex-wrap gap-3 text-fs-2 text-muted" aria-label={t("board.legend")}>
        <li>
          <Badge tone="success">{t("board.legendFree")}</Badge>
        </li>
        <li>
          <Badge tone="danger">{t("board.legendBooked")}</Badge>
        </li>
        <li>
          <Badge tone="warning">{t("status.pending")}</Badge>
        </li>
        <li>
          <Badge tone="info">{t("board.service")}</Badge>
        </li>
      </ul>
    </div>
  );
}

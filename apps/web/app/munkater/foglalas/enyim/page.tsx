import Link from "next/link";
import type { Booking } from "@churchy/contracts";
import { addDays } from "@churchy/hu";
import {
  EmptyState,
  Alert,
  Badge,
  ButtonLink,
  FormattedDate,
  FormattedTime,
  Stagger,
} from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms.mine"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

const TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
} as const;

/** *Foglalásaim* (D-60): my upcoming requests and bookings; a series is one card. */
export default async function MyBookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [env, t, r, query] = await Promise.all([
    getMemberEnv(),
    getT("munkater.rooms.mine"),
    getT("munkater.rooms"),
    searchParams,
  ]);
  const personId = env.ctx.actor.personId;
  const [rows, rooms] = await Promise.all([
    env.repos.bookings.list(env.ctx, {
      from: new Date(env.now.getTime() - 86_400_000).toISOString(),
      to: `${addDays(env.today, 400)}T00:00:00Z`,
      statuses: ["pending", "approved", "rejected"],
    }),
    env.repos.rooms.list(env.ctx),
  ]);
  const roomNames = new Map(rooms.map((x) => [x.id, x.name]));
  const mine = rows.filter(
    (b) => b.source === "user" && personId !== null && b.requestedByPersonId === personId,
  );
  const bySeries = new Map<string, Booking[]>();
  const singles: Booking[] = [];
  for (const b of mine) {
    if (b.seriesId === null) singles.push(b);
    else bySeries.set(b.seriesId, [...(bySeries.get(b.seriesId) ?? []), b]);
  }
  const cards = [
    ...singles.map((b) => ({ first: b, count: 1 })),
    ...[...bySeries.values()].map((list) => ({ first: list[0]!, count: list.length })),
  ].sort((a, b) => Date.parse(a.first.startsAt) - Date.parse(b.first.startsAt));
  const saved = typeof query["mentve"] === "string" ? query["mentve"] : null;

  return (
    <div className="flex flex-col gap-4" data-testid="my-bookings">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      {saved === "jovahagyva" || saved === "kerelem" ? (
        <Alert
          tone="success"
          title={t(saved === "kerelem" ? "savedRequest" : "savedApproved")}
          data-testid="booking-saved"
        >
          {Number(query["ki"]) > 0 ? (
            <p>
              {t("savedSkipped", { created: Number(query["db"]), skipped: Number(query["ki"]) })}
            </p>
          ) : null}
        </Alert>
      ) : null}
      {saved === "modositva" || saved === "lemondva" ? (
        <Alert
          tone="success"
          title={t(saved === "lemondva" ? "cancelled" : "edited")}
          data-testid="booking-saved"
        />
      ) : null}
      {cards.length === 0 ? (
        <EmptyState size="sm" title={t("empty")} />
      ) : (
        <Stagger as="ul" className="flex flex-col gap-3">
          {cards.map(({ first, count }) => (
            <li
              key={first.id}
              className="flex flex-col gap-1 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
              data-testid="my-booking"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/munkater/foglalas/${first.id}`}
                  className="font-heading text-fs-5 font-bold text-primary"
                >
                  {first.title}
                </Link>
                <Badge tone={TONE[first.status]}>{r(`status.${first.status}`)}</Badge>
                {count > 1 ? <Badge tone="info">{t("series", { count })}</Badge> : null}
              </div>
              <p className="text-muted">
                {roomNames.get(first.roomId)} ·{" "}
                <FormattedDate value={first.startsAt} format="short" />{" "}
                <FormattedTime value={first.startsAt} />–<FormattedTime value={first.endsAt} />
              </p>
            </li>
          ))}
        </Stagger>
      )}
      <ButtonLink href="/munkater/foglalas/uj" className="self-start">
        {t("new")}
      </ButtonLink>
    </div>
  );
}

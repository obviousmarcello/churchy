import { Badge, ButtonLink, Stagger } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { loadRoomViews } from "@/server/rooms";
import { getMemberEnv } from "@/server/workspace";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.rooms.catalog"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/** *Termek* (D-60): the catalog with capacity, equipment, managers and booking policy. */
export default async function RoomCatalogPage() {
  const [env, t, r] = await Promise.all([
    getMemberEnv(),
    getT("munkater.rooms.catalog"),
    getT("munkater.rooms"),
  ]);
  const views = await loadRoomViews(env);
  return (
    <div className="flex flex-col gap-4" data-testid="rooms-catalog">
      <header>
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {t("title")}
        </h1>
        <p className="mt-1 text-fs-4 text-muted">{t("lead")}</p>
      </header>
      <Stagger as="ul" className="grid gap-3 md:grid-cols-2">
        {views.map(({ room, locationName, managers, canBook }) => {
          const access = [
            room.accessibility.wheelchair ? t("wheelchair") : null,
            room.accessibility.accessibleToilet ? t("toilet") : null,
            room.accessibility.hearingLoop ? t("hearingLoop") : null,
          ].filter((x): x is string => x !== null);
          const auto = room.approvalPolicy.autoApprove.roles.length > 0;
          return (
            <li
              key={room.id}
              className="flex flex-col gap-2 rounded-card border border-hairline bg-surface-raised shadow-xs p-4"
              data-testid="catalog-room"
            >
              <h2 className="font-heading text-fs-5 font-bold">{room.name}</h2>
              <p className="text-muted">
                {locationName} ·{" "}
                {room.capacity ? r("capacity", { count: room.capacity }) : r("resource")}
              </p>
              {room.features.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label={t("equipment")}>
                  {room.features.map((f) => (
                    <li key={f}>
                      <Badge>{f}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
              {access.length > 0 ? <p className="text-fs-2">{access.join(" · ")}</p> : null}
              {managers.length > 0 ? (
                <p className="text-fs-2">{t("managers", { names: managers.join(", ") })}</p>
              ) : null}
              <p className="text-fs-2 text-muted">
                {auto ? t("approvalAuto") : t("approvalManual")}
                {room.rules.maxDurationMin
                  ? ` · ${t("maxDuration", { hours: Math.round((room.rules.maxDurationMin / 60) * 10) / 10 })}`
                  : ""}
              </p>
              {canBook ? (
                <ButtonLink
                  href={`/munkater/foglalas/uj?terem=${room.id}`}
                  size="sm"
                  variant="secondary"
                  className="self-start"
                >
                  {r("board.book")}
                </ButtonLink>
              ) : null}
            </li>
          );
        })}
      </Stagger>
    </div>
  );
}

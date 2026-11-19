import Link from "next/link";
import { Badge, ButtonLink } from "@churchy/ui";
import { AdminPage } from "@/components/admin";
import { DeleteButton } from "@/components/admin/content/delete-button";
import { SavedNotice } from "@/components/admin/content/list-parts";
import { getT } from "@/i18n/server";
import { adminData, mayOpen } from "@/server/content-admin";
import { deleteRoomAction, deleteServiceBlockAction } from "@/server/room-admin-actions";

export async function generateMetadata() {
  const [nav, common] = await Promise.all([getT("common.nav"), getT("common")]);
  return {
    title: `${nav("sections.adminRooms")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

/** Room catalog (D-60) and the service → room block mapping (D-61). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [nav, t, query] = await Promise.all([
    getT("common.nav"),
    getT("admin.content.rooms"),
    searchParams,
  ]);
  const title = nav("sections.adminRooms");
  if (!(await mayOpen("adminRooms"))) return <AdminPage title={title} section="adminRooms" />;
  const { ctx, repos } = await adminData();
  const [rooms, blocks, locations] = await Promise.all([
    repos.rooms.list(ctx),
    repos.rooms.listServiceBlocks(ctx),
    repos.locations.list(ctx),
  ]);
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  return (
    <AdminPage
      title={title}
      lead={t("lead")}
      section="adminRooms"
      breadcrumbs={[{ label: title }]}
      testId="admin-rooms"
      actions={<ButtonLink href="/admin/termek/uj">{t("newButton")}</ButtonLink>}
    >
      <SavedNotice saved={query["mentve"] === "1"} />
      {rooms.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border rounded-md border border-border"
          data-testid="rooms-list"
        >
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3"
              data-testid="room-row"
            >
              <Link href={`/admin/termek/${r.id}`} className="font-semibold text-primary">
                {r.name}
              </Link>
              <span className="text-muted">{locName.get(r.locationId)}</span>
              <Badge>{r.capacity ? t("capacity", { count: r.capacity }) : t("resource")}</Badge>
              {!r.active ? <Badge tone="warning">{t("inactive")}</Badge> : null}
              <span className="ml-auto">
                <DeleteButton name={r.name} onDelete={deleteRoomAction.bind(null, r.id)} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <section
        aria-labelledby="blocks-h"
        className="flex flex-col gap-3"
        data-testid="service-blocks"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="blocks-h" className="font-heading text-fs-5 font-bold">
            {t("blocks.title")}
          </h2>
          <ButtonLink href="/admin/termek/blokkok/uj" variant="secondary" size="sm">
            {t("blocks.new")}
          </ButtonLink>
        </div>
        <p className="text-muted">{t("blocks.lead")}</p>
        {blocks.length === 0 ? (
          <p>{t("blocks.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <Link href={`/admin/termek/blokkok/${b.id}`} className="font-semibold text-primary">
                  {b.serviceType}
                </Link>
                <span className="text-muted">
                  {locName.get(b.locationId)} → {b.roomIds.map((id) => roomName.get(id)).join(", ")}
                </span>
                <Badge>
                  {t("blocks.buffers", { before: b.bufferBeforeMin, after: b.bufferAfterMin })}
                </Badge>
                <span className="ml-auto">
                  <DeleteButton
                    name={b.serviceType}
                    onDelete={deleteServiceBlockAction.bind(null, b.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  );
}

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RoomsTabs } from "@/components/rooms/rooms-tabs";
import { getT } from "@/i18n/server";
import { loadRoomViews } from "@/server/rooms";
import { getMemberEnv } from "@/server/workspace";
import { getWorkspaceSections, requireWorkspaceModule } from "@/server/workspace-nav";

/**
 * Room booking section (D-60, D-61): same gate as the nav entry (`can()` + module switch), and
 * the sub-navigation. *Jóváhagyás* only shows for people who may approve a room.
 */
export default async function RoomsLayout({ children }: { children: ReactNode }) {
  await requireWorkspaceModule("ws.rooms");
  const sections = await getWorkspaceSections();
  if (!sections.some((s) => s.id === "rooms")) notFound();
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.rooms.tabs")]);
  const views = await loadRoomViews(env);
  const approvable = new Set(views.filter((v) => v.canApprove).map((v) => v.room.id));
  const pending =
    approvable.size === 0
      ? 0
      : (
          await env.repos.bookings.list(env.ctx, {
            from: "2000-01-01T00:00:00Z",
            to: "2100-01-01T00:00:00Z",
            statuses: ["pending"],
          })
        ).filter((b) => approvable.has(b.roomId)).length;
  return (
    <div className="flex max-w-4xl flex-col gap-4" data-testid="rooms-section">
      <RoomsTabs
        label={t("label")}
        tabs={[
          { id: "board", label: t("board"), href: "/munkater/foglalas" },
          { id: "rooms", label: t("rooms"), href: "/munkater/foglalas/termek" },
          { id: "mine", label: t("mine"), href: "/munkater/foglalas/enyim" },
          ...(approvable.size > 0
            ? [
                {
                  id: "approvals",
                  label: t("approvals"),
                  href: "/munkater/foglalas/jovahagyas",
                  count: pending,
                },
              ]
            : []),
        ]}
      />
      {children}
    </div>
  );
}

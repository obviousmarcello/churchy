import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { SongForm } from "@/components/worship/song-form";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.songs"), getT("common")]);
  return { title: `${t("edit")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspaceModule("ws.worship");
  const [{ id }, env, t] = await Promise.all([params, getMemberEnv(), getT("munkater.songs")]);
  if (!can(env.actor, "song.edit", { tenantId: env.tenantId })) notFound();
  const [song, hymnals] = await Promise.all([
    env.repos.songs.get(env.ctx, id),
    env.repos.songs.listHymnals(env.ctx),
  ]);
  if (song === null) notFound();
  return (
    <div className="flex flex-col gap-5" data-testid="song-edit-page">
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{t("edit")}</h1>
      <SongForm song={song} hymnals={hymnals} />
    </div>
  );
}

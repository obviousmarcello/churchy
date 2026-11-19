import { notFound } from "next/navigation";
import { can } from "@churchy/policy";
import { SongForm } from "@/components/worship/song-form";
import { getT } from "@/i18n/server";
import { getMemberEnv } from "@/server/workspace";
import { requireWorkspaceModule } from "@/server/workspace-nav";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("munkater.songs"), getT("common")]);
  return { title: `${t("new")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

export default async function NewSongPage() {
  await requireWorkspaceModule("ws.worship");
  const [env, t] = await Promise.all([getMemberEnv(), getT("munkater.songs")]);
  if (!can(env.actor, "song.edit", { tenantId: env.tenantId })) notFound();
  const hymnals = await env.repos.songs.listHymnals(env.ctx);
  return (
    <div className="flex flex-col gap-5" data-testid="song-new-page">
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{t("new")}</h1>
      <SongForm song={null} hymnals={hymnals} />
    </div>
  );
}

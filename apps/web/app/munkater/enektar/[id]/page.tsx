import { redirect } from "next/navigation";

/** A song's own address: the song browser shows its details (`?song=`), as in Music Sheet DB. */
export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/munkater/enektar?song=${encodeURIComponent(id)}`);
}

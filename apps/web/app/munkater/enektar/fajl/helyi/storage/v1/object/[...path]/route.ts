import { localMusicStorageRequest } from "@/server/data-adapters";
import { musicTenant } from "@/server/music/policy";
import { musicSupabaseConfigured } from "@/server/music/supabase";
import { withPolicyRoute } from "@/server/policy";

// Local mode of the music module (demo, Phase A, e2e; PLAN §14): the browser's side of the
// in-memory Storage — the signed upload (PUT) and download (GET) URLs that the local client hands
// out. Each needs its one-time ticket; with a Supabase project this route answers 404.

export async function GET(request: Request): Promise<Response> {
  if (musicSupabaseConfigured()) return new Response(null, { status: 404 });
  return localMusicStorageRequest(request);
}

export const PUT = withPolicyRoute(
  "music.song.manage",
  musicTenant,
  async (_scope, request: Request) => {
    if (musicSupabaseConfigured()) return new Response(null, { status: 404 });
    return localMusicStorageRequest(request);
  },
);

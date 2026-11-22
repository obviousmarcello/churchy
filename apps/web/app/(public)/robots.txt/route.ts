import { robotsTxt, seoHeaders } from "@/lib/seo";
import { siteIndexable } from "@/server/public-seo";
import { siteOrigin } from "@/server/site-base";

export const dynamic = "force-dynamic";

/**
 * `/robots.txt` (NFR-08, D-17): the church's site may be crawled (app areas excluded) and points
 * to its sitemap; the demo deployment disallows everything (D-92 AC3). No cookies: the response
 * carries none, and the proxy skips this path.
 */
export async function GET(): Promise<Response> {
  return new Response(robotsTxt({ origin: await siteOrigin(), indexable: siteIndexable() }), {
    headers: seoHeaders("text/plain"),
  });
}

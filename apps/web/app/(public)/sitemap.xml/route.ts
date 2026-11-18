import { seoHeaders, sitemapXml } from "@/lib/seo";
import { getSitemapEntries } from "@/server/public-seo";

export const dynamic = "force-dynamic";

/**
 * `/sitemap.xml` — every public URL of the request's church (NFR-08, SDD §15, D-17): static and
 * term routes, news posts, events, locations and announcement weeks. Public hosts set no cookies:
 * the response carries none, and the proxy skips this path.
 */
export async function GET(): Promise<Response> {
  return new Response(sitemapXml(await getSitemapEntries()), {
    headers: seoHeaders("application/xml"),
  });
}

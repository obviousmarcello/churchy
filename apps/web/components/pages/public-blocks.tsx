import type { PageBlock } from "@churchy/contracts";
import { PageBlocks } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getBlockMedia } from "@/server/public-pages";
import { getSiteHref } from "@/server/site-base";

/**
 * Page blocks of a public page (D-16) through the allow-list renderer of `@churchy/ui`, with the
 * page's public media resolved and the Hungarian labels from `public.blocks`.
 */
export async function PublicBlocks({
  blocks,
  className,
}: {
  blocks: readonly PageBlock[];
  className?: string;
}) {
  const [t, media, siteHref] = await Promise.all([
    getT("public.blocks"),
    getBlockMedia({ blocks: [...blocks] }),
    getSiteHref(),
  ]);
  // A call-to-action to a page of the church leads to it under the site's base path (demo).
  const linked = blocks.map((b) => (b.type === "cta" ? { ...b, href: siteHref(b.href) } : b));
  return (
    <PageBlocks
      blocks={linked}
      images={media.images}
      files={media.files}
      className={className}
      labels={{
        gallery: t("gallery"),
        fileInfo: (file) => t("fileInfo", { kilobytes: file.kilobytes }),
        embed: {
          notice: (provider) => t("embedNotice", { provider }),
          load: t("embedLoad"),
          frameTitle: (provider) => t("embedFrameTitle", { provider }),
        },
      }}
    />
  );
}

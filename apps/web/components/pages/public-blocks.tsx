import type { PageBlock } from "@churchy/contracts";
import { PageBlocks } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getBlockMedia } from "@/server/public-pages";

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
  const [t, media] = await Promise.all([
    getT("public.blocks"),
    getBlockMedia({ blocks: [...blocks] }),
  ]);
  return (
    <PageBlocks
      blocks={blocks}
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

import type { Post } from "@churchy/contracts";
import { Badge, FormattedDate, RichTextContent } from "@churchy/ui";
import { getT } from "@/i18n/server";

/**
 * The title block and body of a news post. The public post page (`app/(public)/hirek/[postSlug]`)
 * and the admin preview (D-20) both render this, so a preview shows the real template.
 */
export async function NewsArticleBody({ post }: { post: Post }) {
  const t = await getT("public.news");
  return (
    <>
      <header className="flex max-w-prose flex-col gap-4">
        {post.categories.length > 0 ? (
          <ul aria-label={t("categories")} className="flex flex-wrap gap-2">
            {post.categories.map((c) => (
              <li key={c}>
                <Badge>{c}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
          {post.title}
        </h1>
        {post.publishedAt ? (
          <p className="text-fs-3 text-muted">
            {t("publishedOn")}{" "}
            <FormattedDate value={post.publishedAt} data-testid="news-published" />
          </p>
        ) : null}
        {post.lead ? <p className="text-fs-5 leading-snug">{post.lead}</p> : null}
      </header>

      <RichTextContent doc={post.body} className="max-w-prose" />
    </>
  );
}

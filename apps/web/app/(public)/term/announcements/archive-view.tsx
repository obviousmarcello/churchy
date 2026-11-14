import type { Announcement, ListPage } from "@churchy/contracts";
import type { LiturgicalFamily } from "@churchy/calendar";
import { Badge } from "@churchy/ui";
import { LINK_CLASS } from "@/components/events/event-parts";
import { getT } from "@/i18n/server";
import { announcementWeek, announcementsHref, archiveByYear } from "@/lib/announcements/view";

/**
 * The archive (`?nezet=archivum`): every published week, newest first, grouped by year, with the
 * Sunday's date and liturgical name; paged by {@link ARCHIVE_PAGE_SIZE}.
 */
export async function ArchiveView({
  basePath,
  list,
  latestId,
  family,
}: {
  basePath: string;
  list: ListPage<Announcement>;
  latestId: string | null;
  family: LiturgicalFamily;
}) {
  const t = await getT("public.announcements");
  const groups = archiveByYear(list.items);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <section aria-labelledby="archive-heading" data-testid="announcements-archive">
      <h1
        id="archive-heading"
        className="font-heading text-fs-7 leading-[1.05] font-bold text-primary print:text-[20pt]"
      >
        {t("archiveTitle")}
      </h1>
      <p className="mt-2 text-fs-3 text-muted">{t("archiveLead")}</p>
      <p className="mt-4 print:hidden">
        <a href={basePath} className={LINK_CLASS}>
          <span aria-hidden="true">‹ </span>
          {t("toLatest")}
        </a>
      </p>

      {groups.length === 0 ? (
        <p className="mt-8 text-fs-4 text-muted">{t("archiveEmpty")}</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.year}
            aria-labelledby={`archive-${group.year}`}
            className="mt-8 flex flex-col gap-3"
          >
            <h2
              id={`archive-${group.year}`}
              className="border-b-2 border-border pb-2 font-heading text-fs-5 font-bold text-primary"
            >
              {group.year}
            </h2>
            <ol className="flex flex-col gap-2">
              {group.items.map((item) => {
                const week = announcementWeek(item.weekSunday, family);
                return (
                  <li
                    key={item.id}
                    data-testid="archive-week"
                    data-week={item.weekSunday}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-fs-4"
                  >
                    <a
                      href={announcementsHref(basePath, { week: item.weekSunday })}
                      className={LINK_CLASS}
                    >
                      {week.liturgicalName === null
                        ? week.dateLabel
                        : t("archiveItem", { date: week.dateLabel, day: week.liturgicalName })}
                    </a>
                    <span className="text-fs-2 text-muted">{week.range}</span>
                    {item.id === latestId ? <Badge tone="primary">{t("latest")}</Badge> : null}
                    {item.pdfMediaId !== null ? <Badge>{t("withPdf")}</Badge> : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}

      {pages > 1 ? (
        <nav aria-label={t("archivePages")} className="mt-8 print:hidden">
          <ul className="flex flex-wrap justify-between gap-4 text-fs-3 font-semibold">
            <li>
              {list.page > 1 ? (
                <a
                  href={announcementsHref(basePath, { archive: true, page: list.page - 1 })}
                  rel="prev"
                  className={LINK_CLASS}
                >
                  <span aria-hidden="true">← </span>
                  {t("archiveNewer")}
                </a>
              ) : null}
            </li>
            <li>
              {list.page < pages ? (
                <a
                  href={announcementsHref(basePath, { archive: true, page: list.page + 1 })}
                  rel="next"
                  className={LINK_CLASS}
                >
                  {t("archiveOlder")}
                  <span aria-hidden="true"> →</span>
                </a>
              ) : null}
            </li>
          </ul>
        </nav>
      ) : null}
    </section>
  );
}

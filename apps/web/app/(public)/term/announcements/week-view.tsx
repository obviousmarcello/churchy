import type { Announcement, Ctx } from "@churchy/contracts";
import type { LiturgicalFamily } from "@churchy/calendar";
import { Alert, Badge, ButtonLink, cn } from "@churchy/ui";
import { PrintButton } from "@/components/announcements/print-button";
import { RichBody } from "@/components/announcements/rich-body";
import { LINK_CLASS } from "@/components/events/event-parts";
import { getT } from "@/i18n/server";
import {
  announcementHeading,
  announcementWeek,
  announcementsHref,
  neighbours,
} from "@/lib/announcements/view";
import { announcementFile } from "@/server/public-announcements";

const HEADING_CLASS =
  "font-heading text-fs-7 leading-[1.05] font-bold text-primary print:text-[20pt]";

/**
 * One week of announcements: the heading with the liturgical Sunday name, the week navigation
 * (hidden in print), the body and the PDF attachment. `sunday` is null only when the church has
 * no published announcement at all.
 */
export async function WeekView({
  basePath,
  ctx,
  announcement,
  sunday,
  latestId,
  items,
  family,
}: {
  basePath: string;
  ctx: Ctx;
  announcement: Announcement | null;
  sunday: string | null;
  latestId: string | null;
  items: readonly Announcement[];
  family: LiturgicalFamily;
}) {
  const t = await getT("public.announcements");

  if (sunday === null) {
    return (
      <>
        <h1 className={HEADING_CLASS}>{t.term("announcementsSection").nom}</h1>
        <p className="mt-6 text-fs-4 text-muted" data-testid="announcements-empty">
          {t("empty")}
        </p>
      </>
    );
  }

  const week = announcementWeek(sunday, family);
  const { older, newer } = neighbours(items, sunday);
  const isLatest = announcement !== null && announcement.id === latestId;
  const file = await announcementFile(ctx, announcement);

  return (
    <article
      aria-labelledby="announcement-heading"
      data-testid="announcement"
      data-week={sunday}
      className="flex flex-col"
    >
      <h1 id="announcement-heading" className={HEADING_CLASS} data-testid="announcement-heading">
        {announcementHeading(sunday, family, t)}
      </h1>
      <p
        className="mt-2 flex flex-wrap items-center gap-3 text-fs-3 text-muted print:text-[11pt]"
        data-testid="announcement-week"
      >
        <span>{t("weekRange", { range: week.range })}</span>
        {isLatest ? (
          <Badge tone="primary" className="print:hidden" data-testid="announcement-latest">
            {t("latest")}
          </Badge>
        ) : null}
      </p>

      <nav aria-label={t("weekNavigation")} className="mt-6 print:hidden">
        <ul className="flex flex-wrap items-center gap-2" data-testid="announcement-nav">
          <li>
            {older ? (
              <ButtonLink
                variant="secondary"
                size="sm"
                rel="prev"
                href={announcementsHref(basePath, { week: older.weekSunday })}
              >
                <span aria-hidden="true">‹</span> {t("previousWeek")}
              </ButtonLink>
            ) : null}
          </li>
          <li>
            <ButtonLink
              variant="secondary"
              size="sm"
              href={announcementsHref(basePath, { archive: true })}
            >
              {t("archive")}
            </ButtonLink>
          </li>
          <li>
            {newer ? (
              <ButtonLink
                variant="secondary"
                size="sm"
                rel="next"
                href={announcementsHref(basePath, { week: newer.weekSunday })}
              >
                {t("nextWeek")} <span aria-hidden="true">›</span>
              </ButtonLink>
            ) : null}
          </li>
          {!isLatest && latestId !== null ? (
            <li>
              <a href={basePath} className={cn(LINK_CLASS, "ms-2")}>
                {t("toLatest")}
              </a>
            </li>
          ) : null}
          {announcement !== null ? (
            <li className="ms-auto">
              <PrintButton label={t("print")} />
            </li>
          ) : null}
        </ul>
      </nav>

      {announcement === null ? (
        <div className="mt-8 max-w-prose">
          <Alert tone="info">
            <p data-testid="announcement-missing">{t("weekMissing", { range: week.range })}</p>
          </Alert>
        </div>
      ) : (
        <>
          {announcement.body !== null ? (
            <RichBody
              doc={announcement.body}
              className="mt-8 flex flex-col gap-4 text-fs-4 leading-relaxed print:mt-4 print:gap-2 print:text-[11pt]"
            />
          ) : null}
          {file !== null ? (
            <section
              aria-labelledby="announcement-attachment"
              className="mt-10 max-w-prose rounded-lg border border-border bg-surface-raised p-5 shadow-card print:hidden"
              data-testid="announcement-attachment"
            >
              <h2 id="announcement-attachment" className="font-heading text-fs-5 font-bold">
                {t("attachmentTitle")}
              </h2>
              <p className="mt-1 text-fs-3">
                <span className="font-semibold">{file.filename}</span>{" "}
                <span className="text-muted">({t("pdfMeta", { size: file.kilobytes })})</span>
              </p>
              <ul className="mt-4 flex flex-wrap items-center gap-4">
                <li>
                  <ButtonLink
                    href={file.href}
                    download={file.filename}
                    size="sm"
                    data-testid="announcement-pdf-download"
                  >
                    {t("downloadPdf")}
                  </ButtonLink>
                </li>
                <li>
                  <a href={file.href} className={LINK_CLASS} data-testid="announcement-pdf-open">
                    {t("openPdf")}
                  </a>
                </li>
              </ul>
            </section>
          ) : null}
        </>
      )}
    </article>
  );
}

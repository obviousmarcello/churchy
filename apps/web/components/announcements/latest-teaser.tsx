import { ButtonLink, SectionHeading } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { announcementWeek, teaserLines } from "@/lib/announcements/view";
import { termRoutePath } from "@/lib/term-routes";
import { getLatestAnnouncement } from "@/server/public-announcements";

/** Lines of the latest announcement the teaser shows. */
const TEASER_LINES = 3;

/**
 * Home-page card of the latest weekly announcement (SDD §7.1 *Heti hirdetések*, D-14 AC1): the
 * week, its first items and links to the full page (one click) and to the PDF. Renders nothing
 * while the church has no published announcement or the module is off. For the home page (D-10).
 */
export async function LatestAnnouncementTeaser() {
  const latest = await getLatestAnnouncement();
  if (latest === null) return null;
  const t = await getT("public.announcements");
  const { announcement, file, config } = latest;
  const week = announcementWeek(announcement.weekSunday, config.calendarFamily);
  const href = termRoutePath(t, "announcementsSection");
  const lines = teaserLines(announcement.body, TEASER_LINES);

  return (
    <section
      aria-labelledby="home-announcements"
      className="flex flex-col gap-4"
      data-testid="announcements-teaser"
    >
      <SectionHeading
        id="home-announcements"
        title={t("teaserTitle")}
        eyebrow={week.liturgicalName ?? undefined}
        action={<span className="text-fs-3 text-muted">{week.range}</span>}
      />
      {lines.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-6 text-fs-3">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={href} size="sm" data-testid="announcements-teaser-read">
          {t("teaserRead")}
        </ButtonLink>
        {file !== null ? (
          <ButtonLink href={file.href} download={file.filename} variant="secondary" size="sm">
            {t("teaserPdf")}
          </ButtonLink>
        ) : null}
      </div>
    </section>
  );
}

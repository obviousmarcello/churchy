import { notFound } from "next/navigation";
import { Alert, ButtonLink } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { getWorkspaceSections } from "@/server/workspace-nav";

const PLACEHOLDERS = ["tavollet", "hr"] as const;
type Placeholder = (typeof PLACEHOLDERS)[number];

const isPlaceholder = (slug: string | undefined): slug is Placeholder =>
  PLACEHOLDERS.includes(slug as Placeholder);

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const common = await getT("common");
  if (!isPlaceholder(slug[0])) return { robots: { index: false, follow: false } };
  const t = await getT(`munkater.placeholder.${slug[0]}`);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/**
 * Stand-in for the workspace sections whose modules come with later deliverables (room booking,
 * worship plans, song library, absences, HR). They already have their final route, nav entry and
 * permission check (`filterNav()` → `can()`); the deliverable replaces this page with a real one
 * by adding `app/munkater/<route>/page.tsx`, which takes precedence over this catch-all.
 */
export default async function WorkspacePlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const [name, ...rest] = slug;
  if (!isPlaceholder(name) || rest.length > 0) notFound();
  const sections = await getWorkspaceSections();
  // A section the actor may not use (or whose module is off) is not there.
  if (!sections.some((s) => s.href === `/munkater/${name}`)) notFound();
  const [t, common] = await Promise.all([
    getT(`munkater.placeholder.${name}`),
    getT("munkater.placeholder"),
  ]);

  return (
    <div
      className="flex max-w-2xl flex-col gap-4"
      data-testid="workspace-placeholder"
      data-section={name}
    >
      <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">{t("title")}</h1>
      <p className="text-fs-4 text-muted">{t("lead")}</p>
      <Alert tone="info" title={common("title")}>
        <p>{common("body")}</p>
      </Alert>
      <ButtonLink href="/munkater" variant="secondary" className="self-start">
        {common("toToday")}
      </ButtonLink>
    </div>
  );
}

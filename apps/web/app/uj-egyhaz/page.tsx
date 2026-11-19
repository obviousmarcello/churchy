import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, PageShell } from "@churchy/ui";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { getT } from "@/i18n/server";
import { demoModeEnabled } from "@/lib/demo/flag";

export async function generateMetadata() {
  const [t, common] = await Promise.all([getT("admin.setup"), getT("common")]);
  return { title: `${t("title")} · ${common("appName")}`, robots: { index: false, follow: false } };
}

/**
 * Public entry of the first-setup wizard (D-34), demo mode only: a prospective church pastes its
 * website's address and gets a draft site. Outside demo mode the wizard is in the admin
 * (`/admin/inditas`) and this page does not exist.
 */
export default async function NewChurchPage() {
  if (!demoModeEnabled()) notFound();
  const [t, common] = await Promise.all([getT("admin.setup"), getT("common")]);
  return (
    <PageShell
      skipLinkLabel={common("skipToContent")}
      header={
        <header className="border-b border-border bg-surface-raised">
          <Container className="flex min-h-16 items-center">
            <Link href="/" className="font-heading text-fs-4 font-bold text-primary">
              {common("appName")}
            </Link>
          </Container>
        </header>
      }
    >
      <Container className="grid gap-6 py-10">
        <header>
          <h1 className="font-heading text-fs-7 leading-[1.05] font-bold text-primary">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-prose text-fs-4 text-muted">{t("lead")}</p>
        </header>
        <SetupWizard />
      </Container>
    </PageShell>
  );
}

import type { Metadata } from "next";
import { ArrowLeftIcon, Card, Reveal } from "@churchy/ui";
import { getT } from "@/i18n/server";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { demoModeEnabled } from "@/lib/demo/flag";
import { DISPLAY_FONT } from "@/components/platform/display-font";
import { demoDirectory } from "@/server/data-adapters";
import { LoginForm, type LoginAccount } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const [t, common] = await Promise.all([getT("public.login"), getT("common")]);
  return {
    title: `${t("metaTitle")} · ${common("appName")}`,
    robots: { index: false, follow: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Sign-in for *szolgálók* and *munkatársak* (`/belepes`): e-mail and password, a magic link and
 * the forgotten-password stub. The identity provider is behind `getAuthProvider()` (the mock until
 * Supabase Auth, `server/auth.ts`). In demo mode a collapsed *Demo fiókok* panel lists the
 * fictitious accounts; outside demo mode the form is replaced by a notice. `?egyhaz=<slug>` (the
 * church site's *Belépés* link) makes the person sign in to that church.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const [t, personas, destinations, params] = await Promise.all([
    getT("public.login"),
    getT("common.demo.personas"),
    getT("public.login.demo.destinations"),
    searchParams,
  ]);
  const demo = demoModeEnabled();
  const slug = typeof params.egyhaz === "string" ? params.egyhaz : null;
  const churchSlug =
    demo && slug !== null && demoDirectory().contexts.some((c) => c.slug === slug) ? slug : null;

  const accounts: LoginAccount[] = demo
    ? DEMO_ACCOUNTS.map((a) => ({
        email: a.email,
        role: personas(a.persona),
        destination: destinations(a.home),
      }))
    : [];

  return (
    <div className="mx-auto grid w-full max-w-(--content-max) place-items-center px-(--gutter) py-12 lg:py-20">
      <Reveal className="w-full max-w-lg">
        <Card variant="raised" as="section" padding="md" data-testid="login-card">
          <div className="grid gap-6 p-1 sm:p-2">
            <header className="grid gap-2">
              <h1
                className="m-0 text-[2.5rem] leading-none font-medium tracking-[-0.01em] text-primary"
                style={{ fontFamily: DISPLAY_FONT }}
              >
                {t("title")}
              </h1>
              <p className="m-0 text-fs-3 text-muted">{t("lead")}</p>
            </header>
            <LoginForm
              accounts={accounts}
              unavailable={!demo}
              churchSlug={churchSlug}
              demoPassword={t("demo.password")}
            />
            <p className="m-0">
              <a
                href="/"
                className="inline-flex min-h-11 items-center gap-1.5 text-fs-3 font-semibold text-primary underline underline-offset-4"
              >
                <ArrowLeftIcon size="sm" />
                {t("back")}
              </a>
            </p>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}

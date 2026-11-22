"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Disclosure, Input, MailIcon, buttonClasses, cn } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { signIn, type SignInState } from "@/server/demo-actions";

export interface LoginAccount {
  readonly email: string;
  /** The persona's label (e.g. *Tulajdonos*). */
  readonly role: string;
  /** Where signing in leads (e.g. *Munkatér*). */
  readonly destination: string;
}

const INITIAL: SignInState = { status: "idle", email: "" };

/**
 * The sign-in form of `/belepes` (client: it keeps what was typed, shows the result of the server
 * action and fills the demo accounts' details on request). The action is `signIn`
 * (`server/demo-actions.ts`), which talks to the identity provider behind `getAuthProvider()`.
 * `accounts` is empty outside demo mode; `unavailable` then replaces the form with a notice.
 */
export function LoginForm({
  accounts,
  unavailable,
  churchSlug,
  demoPassword,
}: {
  accounts: readonly LoginAccount[];
  unavailable: boolean;
  churchSlug: string | null;
  demoPassword: string;
}) {
  const t = useT("public.login");
  const [state, formAction, pending] = useActionState(signIn, INITIAL);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const emailError =
    state.status === "error" && (state.error === "emailRequired" || state.error === "emailInvalid")
      ? t(`errors.${state.error}`)
      : undefined;
  const passwordError =
    state.status === "error" && state.error === "passwordRequired"
      ? t("errors.passwordRequired")
      : undefined;
  const formError =
    state.status === "error" && (state.error === "invalid" || state.error === "generic")
      ? t(`errors.${state.error}`)
      : undefined;

  if (unavailable) {
    return (
      <Alert tone="info" title={t("unavailable.title")} data-testid="login-unavailable">
        <p>{t("unavailable.body")}</p>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6">
      <form action={formAction} noValidate className="grid gap-5" data-testid="login-form">
        {churchSlug ? <input type="hidden" name="church" value={churchSlug} /> : null}

        {formError ? (
          <Alert tone="danger" role="alert" data-testid="login-error">
            <p>{formError}</p>
          </Alert>
        ) : null}
        {state.status === "link-sent" ? (
          <Alert
            tone="success"
            title={t("linkSent.title")}
            role="status"
            data-testid="login-link-sent"
          >
            <p>{t("linkSent.body")}</p>
          </Alert>
        ) : null}
        {state.status === "forgot" ? (
          <Alert tone="info" role="status" data-testid="login-forgot">
            <p>{t("forgotNotice")}</p>
          </Alert>
        ) : null}

        <Input
          label={t("email")}
          help={t("emailHelp")}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...(emailError ? { error: emailError } : {})}
        />
        <Input
          label={t("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          {...(passwordError ? { error: passwordError } : {})}
        />

        <div className="grid gap-3">
          <Button
            type="submit"
            name="intent"
            value="password"
            size="lg"
            loading={pending}
            data-testid="login-submit"
          >
            {t("submit")}
          </Button>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button type="submit" name="intent" value="link" variant="outline" size="md">
              <MailIcon />
              {t("magicLink")}
            </Button>
            <Button type="submit" name="intent" value="forgot" variant="ghost" size="md">
              {t("forgot")}
            </Button>
          </div>
          <p className="m-0 text-fs-2 text-muted">{t("magicLinkHelp")}</p>
        </div>
      </form>

      {accounts.length > 0 ? (
        <Disclosure summary={t("demo.summary")} data-testid="login-demo-accounts">
          <p className="m-0 mb-3 text-muted">{t("demo.lead")}</p>
          <ul aria-label={t("demo.listLabel")} className="m-0 grid list-none gap-1 p-0">
            {accounts.map((account) => (
              <li
                key={account.email}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[12px] px-2 py-1"
              >
                <span className="grid min-w-0">
                  <span className="text-fs-3 font-semibold text-text">{account.role}</span>
                  <span className="text-fs-2 break-all text-muted" data-testid="demo-account-email">
                    {account.email}
                  </span>
                  <span className="text-fs-2 text-muted">
                    {t("demo.goesTo")}: {account.destination}
                  </span>
                </span>
                <button
                  type="button"
                  className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "shrink-0")}
                  data-testid="demo-account-fill"
                  data-email={account.email}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(demoPassword);
                  }}
                >
                  {t("demo.fill")}
                  <span className="sr-only"> – {account.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CONTACT_MESSAGE_MAX } from "@churchy/contracts";
import { Alert, Button, Checkbox, Input, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { HONEYPOT_FIELD } from "@/lib/contact-form";
import { INITIAL_CONTACT_STATE, type ContactFormState } from "@/lib/contact-form-state";

type Action = (state: ContactFormState, form: FormData) => Promise<ContactFormState>;

/**
 * *Írjon nekünk* (D-12). Validation happens on the server (Hungarian messages, `noValidate` so the
 * browser's own, locale-dependent bubbles never show); the form keeps what was typed on errors.
 */
export function ContactForm({ action, privacyHref }: { action: Action; privacyHref: string }) {
  const t = useT("public.contact.form");
  const [state, formAction, pending] = useActionState(action, INITIAL_CONTACT_STATE);
  // Remounts the form (cleared fields) for "write another message".
  const [round, setRound] = useState(0);
  const [dismissed, setDismissed] = useState<ContactFormState | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const sent = state.status === "sent" && state !== dismissed;
  useEffect(() => {
    if (state.status === "invalid") summaryRef.current?.focus();
    if (state.status === "sent") successRef.current?.focus();
  }, [state]);

  if (sent) {
    return (
      <div ref={successRef} tabIndex={-1} className="outline-none" data-testid="contact-success">
        <Alert tone="success" role="status" title={t("successTitle")}>
          <p>{t("successBody")}</p>
          {state.reference ? (
            <p className="mt-1 font-semibold" data-testid="contact-reference">
              {t("successReference", { reference: state.reference })}
            </p>
          ) : null}
        </Alert>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => {
            setDismissed(state);
            setRound((r) => r + 1);
          }}
        >
          {t("sendAnother")}
        </Button>
      </div>
    );
  }

  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" || state.status === "failed" ? state.values : null;

  return (
    <form
      key={round}
      action={formAction}
      noValidate
      className="grid max-w-2xl gap-5"
      data-testid="contact-form"
    >
      {state.status === "invalid" ? (
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <Alert tone="danger" role="alert" title={t("errorSummary")} />
        </div>
      ) : null}
      {state.status === "failed" ? (
        <Alert tone="danger" role="alert">
          {t("failed")}
        </Alert>
      ) : null}
      <p className="text-fs-3 text-muted">{t("intro")}</p>
      <Input
        name="name"
        label={t("name")}
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={values?.name}
        error={errors.name}
      />
      <Input
        name="email"
        type="email"
        label={t("email")}
        help={t("emailHelp")}
        autoComplete="email"
        required
        maxLength={200}
        defaultValue={values?.email}
        error={errors.email}
      />
      <Input
        name="phone"
        type="tel"
        label={t("phone")}
        optionalLabel={t("optional")}
        autoComplete="tel"
        maxLength={20}
        defaultValue={values?.phone}
        error={errors.phone}
      />
      <Input
        name="subject"
        label={t("subject")}
        required
        maxLength={120}
        defaultValue={values?.subject}
        error={errors.subject}
      />
      <Textarea
        name="message"
        label={t("message")}
        required
        rows={7}
        maxLength={CONTACT_MESSAGE_MAX}
        defaultValue={values?.message}
        error={errors.message}
      />
      {/* Honeypot: off-screen, out of the tab order and hidden from assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="contact-honeypot">{t("honeypot")}</label>
        <input
          id="contact-honeypot"
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <Checkbox
        name="consent"
        label={t("consent")}
        labelContent={
          <>
            {t("consent")}{" "}
            <a href={privacyHref} className="font-semibold text-primary underline">
              {t("privacyLink")}
            </a>
          </>
        }
        required
        defaultChecked={values?.consent ?? false}
        error={errors.consent}
      />
      <div>
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? t("sending") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

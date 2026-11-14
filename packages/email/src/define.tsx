import type { ComponentType } from "react";
import { EmailFrame, type Fact } from "./frame";
import { linkOf } from "./params";
import type { EmailContext, EmailParams, EmailTemplateKey, PushPayload, Translate } from "./types";

export interface EmailTemplateProps {
  params: EmailParams;
  ctx: EmailContext;
}

/** What differs between templates; the copy itself lives in `messages/hu.json` (`email.<key>`). */
export interface TemplateSpec {
  /**
   * Values for the `{placeholders}` of the template's messages. Together with `facts` this is the
   * ONLY place a template reads message params, which is what keeps request and HR mails down to
   * reference, category and link (enforced by `templates.test.tsx`).
   */
  values?: (params: EmailParams, t: Translate) => Record<string, string>;
  /** Labelled rows under the text; labels are messages under `email.labels`. */
  facts?: (params: EmailParams, t: Translate) => Fact[];
  /** Whether `params.link` becomes a button (default true). */
  link?: boolean;
  /**
   * A quoted block of free text under the facts, line breaks kept. Only the contact form uses it
   * (its email delivers the visitor's message to the office, D-12); never set for request or HR
   * templates.
   */
  quote?: (params: EmailParams, t: Translate) => { label: string; text: string } | null;
}

export interface EmailTemplate {
  key: EmailTemplateKey;
  Component: ComponentType<EmailTemplateProps>;
  subject(params: EmailParams, ctx: EmailContext): string;
  push(params: EmailParams, ctx: EmailContext): PushPayload;
}

/** Builds the React Email component, the subject and the push text of one template key. */
export function defineTemplate(key: EmailTemplateKey, spec: TemplateSpec = {}): EmailTemplate {
  const hasLink = spec.link ?? true;
  const valuesOf = (params: EmailParams, t: Translate) => spec.values?.(params, t) ?? {};

  function Component({ params, ctx }: EmailTemplateProps) {
    const { t } = ctx;
    const values = valuesOf(params, t);
    const url = hasLink ? linkOf(params, ctx.baseUrl) : null;
    return (
      <EmailFrame
        brand={t("layout.brand")}
        preheader={t(`${key}.preheader`, values)}
        heading={t(`${key}.heading`, values)}
        paragraphs={[t(`${key}.body`, values)]}
        facts={spec.facts?.(params, t)}
        quote={spec.quote?.(params, t) ?? null}
        action={url ? { label: t(`${key}.cta`, values), url } : null}
        linkFallbackLabel={t("layout.linkFallback")}
        churchLabel={t("layout.churchLabel")}
        churchName={ctx.churchName}
        footerNotice={t("layout.footerNotice")}
      />
    );
  }
  Component.displayName = `Email(${key})`;

  return {
    key,
    Component,
    subject: (params, ctx) => ctx.t(`${key}.subject`, valuesOf(params, ctx.t)),
    push: (params, ctx) => ({
      title: ctx.t(`${key}.pushTitle`, valuesOf(params, ctx.t)),
      body: ctx.t(`${key}.pushBody`, valuesOf(params, ctx.t)),
      link: hasLink ? linkOf(params, ctx.baseUrl) : null,
    }),
  };
}

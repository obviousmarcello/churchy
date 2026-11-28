import { render } from "@react-email/render";
import { EMAIL_TEMPLATES } from "./registry";
import type {
  EmailContext,
  EmailParams,
  EmailTemplateKey,
  PushPayload,
  RenderedEmail,
} from "./types";

/**
 * Renders a notification email through the real React Email pipeline: subject, HTML and the
 * plain-text alternative. Used by the demo outbox viewer today and by the sending worker
 * (`packages/notify`, pg-boss) later, so what the demo shows is what would be sent.
 */
export async function renderEmail(
  template: EmailTemplateKey,
  params: EmailParams,
  ctx: EmailContext,
): Promise<RenderedEmail> {
  const { Component, subject, push } = EMAIL_TEMPLATES[template];
  const element = <Component params={params} ctx={ctx} />;
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: subject(params, ctx), html, text, link: push(params, ctx).link };
}

/** Title, body and tap target of the push notification of a template. */
export function renderPush(
  template: EmailTemplateKey,
  params: EmailParams,
  ctx: EmailContext,
): PushPayload {
  return EMAIL_TEMPLATES[template].push(params, ctx);
}

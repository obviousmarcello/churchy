// @churchy/email — notification templates (React Email) for the outbox viewer and, later, the
// sending worker. See docs/02-SDD.md §4.4 and §12.
export {
  EMAIL_TEMPLATE_KEYS,
  REFERENCE_ONLY_TEMPLATES,
  type EmailContext,
  type EmailParams,
  type EmailTemplateKey,
  type PushPayload,
  type RenderedEmail,
  type Translate,
} from "./types";
export { EMAIL_TEMPLATES, isEmailTemplateKey } from "./registry";
export { renderEmail, renderPush } from "./render";
export { absoluteLink } from "./params";

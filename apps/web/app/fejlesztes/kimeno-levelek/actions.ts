"use server";

import { ANONYMOUS_ACTOR, getRepositories, type Ctx } from "@churchy/contracts";
import { assertDevRoutesVisible } from "@/lib/dev-routes";
import { clearOutbox } from "@/server/data-adapters";
import { getRequestContext } from "@/server/session";

const SAMPLE_FORM_KEY = "dev-minta";

/** Fictitious sample content (CLAUDE.md rule 4). The outbox must never repeat any of it. */
const SAMPLE_DATA = {
  name: "Minta Mária",
  email: "minta.maria@example.test",
  note: "Ez egy kitalált kérelem szövege, amely nem kerülhet bele egyetlen levélbe sem.",
};

/**
 * Dev tool: submits a fictitious request through the real repositories, exactly as the public
 * form would, so the outbox shows the two emails (office notification and confirmation) rendered
 * with the real templates. Creates the sample form on first use.
 */
export async function submitSampleRequest(): Promise<void> {
  assertDevRoutesVisible();
  const { tenantId } = await getRequestContext();
  const { requests } = getRepositories();
  const staff: Ctx = { tenantId, actor: { userId: "dev-user", personId: null } };

  if ((await requests.getForm(staff, SAMPLE_FORM_KEY)) === null) {
    await requests.upsertForm(staff, {
      key: SAMPLE_FORM_KEY,
      title: "Mintakérelem",
      referencePrefix: "KER",
      fields: [
        { type: "text", key: "name", label: "Név", required: true },
        { type: "email", key: "email", label: "E-mail-cím", required: true },
        { type: "textarea", key: "note", label: "Kérelem", required: true },
      ],
    });
  }

  await requests.submit(
    { tenantId, actor: ANONYMOUS_ACTOR },
    {
      formKey: SAMPLE_FORM_KEY,
      data: SAMPLE_DATA,
      consent: true,
      consentTextHash: "dev-minta-hozzajarulas",
    },
  );
}

/** Dev tool: *Kiürítés*. */
export async function clearDemoOutbox(): Promise<void> {
  assertDevRoutesVisible();
  clearOutbox();
}

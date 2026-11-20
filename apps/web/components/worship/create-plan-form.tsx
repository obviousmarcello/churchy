"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Select } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

/** New plan for a service, from a template, in one action (D-66 AC1). */
export function CreatePlanForm({
  service,
  templates,
  create,
}: {
  service: { locationId: string; serviceType: string; startsAt: string; title: string };
  templates: readonly { id: string; name: string }[];
  create: (form: FormData) => Promise<PolicyResult<"ok" | "invalid" | "notFound">>;
}) {
  const t = useT("munkater.worship.create");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="create-plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData();
        form.set("locationId", service.locationId);
        form.set("serviceType", service.serviceType);
        form.set("startsAt", service.startsAt);
        form.set("title", service.title);
        form.set("templateId", template);
        setFailed(false);
        start(async () => {
          const result = await create(form);
          if (!result.ok || result.value !== "ok") setFailed(true);
        });
      }}
    >
      <div className="min-w-56">
        <Select
          label={t("template")}
          value={template}
          placeholder={t("empty")}
          onChange={(e) => setTemplate(e.target.value)}
          options={templates.map((x) => ({ value: x.id, label: x.name }))}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending} data-testid="plan-create">
        {t("submit")}
      </Button>
      {failed ? (
        <Alert tone="danger" title={t("failed")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </form>
  );
}

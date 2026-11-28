"use client";

import { useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { usePolicyAction } from "@/lib/music/policy-form";

export function DeleteEvent({
  id,
  series,
  action,
}: {
  id: string;
  series: boolean;
  action: (
    formData: FormData,
  ) => Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly status: 403 | 404 }
  >;
}) {
  const { m } = useI18n();
  const run = usePolicyAction(action);
  const [pending, start] = useTransition();
  return (
    <div className="w-full max-w-xl px-4 pb-10 sm:px-6">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              `${m.events.delete.confirm}${series ? ` ${m.events.delete.series}` : ""}`,
            )
          ) {
            return;
          }
          const data = new FormData();
          data.set("id", id);
          start(async () => {
            const result = await run(data);
            // An open projection stops the delete: with a second yes it closes and the event goes.
            if (
              typeof result === "object" &&
              result !== null &&
              "message" in result &&
              result.message === m.server.events.projectionOpen &&
              window.confirm(m.events.delete.endProjection)
            ) {
              data.set("endProjections", "1");
              await run(data);
            }
          });
        }}
      >
        {m.events.delete.button}
      </Button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, buttonVariants } from "@/components/music/ui/button";
import { useI18n } from "@/i18n/music/client";
import { createEventPlanAction } from "../actions";

/** The liturgy plan of the event: a link to it, or a button that makes one (for those who edit plans). */
export function PlanLink({
  eventId,
  planId,
  canCreate,
}: {
  eventId: string;
  planId: string | null;
  canCreate: boolean;
}) {
  const { m } = useI18n();
  const t = m.events.plan;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="plan-h">
      <h2 id="plan-h" className="text-lg font-semibold">
        {t.title}
      </h2>
      {planId !== null ? (
        <Link
          href={`/munkater/liturgia/${planId}`}
          className={buttonVariants({ variant: "outline" }) + " self-start"}
        >
          {t.open}
        </Link>
      ) : (
        <>
          <p className="text-sm text-muted">{t.none}</p>
          {canCreate && (
            <Button
              variant="outline"
              disabled={pending}
              className="self-start"
              onClick={() =>
                start(async () => {
                  const data = new FormData();
                  data.set("id", eventId);
                  const result = await createEventPlanAction(data);
                  if (result.ok && result.value.planId !== null) {
                    router.push(`/munkater/liturgia/${result.value.planId}`);
                  } else setFailed(true);
                })
              }
            >
              {t.create}
            </Button>
          )}
        </>
      )}
      <p className="text-sm text-muted">{t.hint}</p>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t.failed}
        </p>
      )}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, Badge, Button, Select, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import type { PolicyResult } from "@/server/policy";

type Outcome = PolicyResult<"ok" | "invalid" | "notFound">;

export interface CommentView {
  id: string;
  author: string;
  /** Formatted on the server (Hungarian date and time). */
  when: string;
  body: string;
  itemTitle: string | null;
  mentioned: string[];
  resolved: boolean;
}

/** Comments on the plan and its items with @mentions, resolve / reopen (D-68 AC2). */
export function PlanComments({
  planId,
  comments,
  items,
  people,
  canResolve,
  readOnly,
  add,
  resolve,
}: {
  planId: string;
  comments: readonly CommentView[];
  items: readonly { id: string; title: string }[];
  people: readonly { id: string; name: string }[];
  canResolve: boolean;
  readOnly: boolean;
  add: (
    planId: string,
    body: string,
    itemId: string | null,
    mentions: string[],
  ) => Promise<Outcome>;
  resolve: (planId: string, commentId: string, resolved: boolean) => Promise<Outcome>;
}) {
  const t = useT("munkater.worship.comments");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [itemId, setItemId] = useState("");
  const [mention, setMention] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (body.trim() === "") {
      setError(t("required"));
      return;
    }
    setError(null);
    start(async () => {
      const result = await add(planId, body.trim(), itemId || null, mention ? [mention] : []);
      if (result.ok && result.value === "ok") {
        setBody("");
        setItemId("");
        setMention("");
        router.refresh();
      } else {
        setError(t("failed"));
      }
    });
  };
  const toggle = (id: string, resolved: boolean) =>
    start(async () => {
      const result = await resolve(planId, id, resolved);
      if (result.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-3" data-testid="plan-comments">
      {comments.length === 0 ? <p className="text-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {comments.map((c) => (
          <li
            key={c.id}
            data-testid="plan-comment"
            data-resolved={c.resolved ? "1" : "0"}
            className="rounded-card border border-hairline bg-surface-raised shadow-xs p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{c.author}</span>
              <span className="text-muted">{c.when}</span>
              {c.itemTitle ? <Badge>{t("onItem", { title: c.itemTitle })}</Badge> : null}
              {c.resolved ? <Badge tone="success">{t("resolved")}</Badge> : null}
            </div>
            <p className="mt-1 whitespace-pre-line">{c.body}</p>
            {c.mentioned.length > 0 ? (
              <p className="mt-1 text-muted">{c.mentioned.map((n) => `@${n}`).join(" ")}</p>
            ) : null}
            {canResolve ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                className="mt-2"
                onClick={() => toggle(c.id, !c.resolved)}
                data-testid="comment-resolve"
              >
                {c.resolved ? t("reopen") : t("resolve")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {readOnly ? null : (
        <div className="flex flex-col gap-3 rounded-control border border-hairline p-3">
          <Textarea
            label={t("body")}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            {...(error ? { error } : {})}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label={t("item")}
              value={itemId}
              placeholder={t("wholePlan")}
              onChange={(e) => setItemId(e.target.value)}
              options={items.map((i) => ({ value: i.id, label: i.title }))}
            />
            <Select
              label={t("mention")}
              value={mention}
              placeholder={t("nobody")}
              onChange={(e) => setMention(e.target.value)}
              options={people.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
          <Button
            type="button"
            className="self-start"
            disabled={pending}
            onClick={submit}
            data-testid="comment-add"
          >
            {t("add")}
          </Button>
        </div>
      )}
      {error && readOnly ? (
        <Alert tone="danger" title={t("failed")}>
          <p>{error}</p>
        </Alert>
      ) : null}
    </div>
  );
}

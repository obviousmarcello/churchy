"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { Label } from "@/components/music/ui/label";
import { useI18n } from "@/i18n/music/client";
import {
  addSongAction,
  addTextItemAction,
  createBlockAction,
  deleteBlockAction,
  moveItemAction,
  removeItemAction,
} from "../actions";

type Item = {
  key: string;
  kind: "song" | "text";
  title: string;
  musicalKey: string | null;
  arrangementId: string | null;
  blockKey: string | null;
};
type SongResult = {
  id: string;
  title: string;
  arrangements: { id: string; name: string; key: string | null }[];
};

type Outcome = { ok: boolean; message?: string | null };
type PolicyOutcome =
  | { readonly ok: true; readonly value: Outcome }
  | { readonly ok: false; readonly status: 403 | 404 };

/** The setlist of an event: its items (songs and text items), blocks, search and add controls. */
export function ItemsPanel({
  eventId,
  items,
  blocks,
  canEdit,
  query,
  results,
}: {
  eventId: string;
  items: Item[];
  blocks: { key: string; name: string }[];
  canEdit: boolean;
  query: string;
  results: SongResult[];
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const t = m.events.items;
  const [picked, setPicked] = useState<string[]>([]);

  const send = (
    action: (formData: FormData) => Promise<PolicyOutcome>,
    fields: Record<string, string | string[]>,
  ) => {
    const data = new FormData();
    data.set("id", eventId);
    for (const [name, value] of Object.entries(fields)) {
      for (const one of Array.isArray(value) ? value : [value]) data.append(name, one);
    }
    start(async () => {
      const result = await action(data);
      const failed = !result.ok || !result.value.ok;
      const code = result.ok ? result.value.message : null;
      setNotice(
        !failed
          ? null
          : code === "full"
            ? t.full
            : code === "ended"
              ? t.ended
              : code === "noArrangement"
                ? t.noArrangement
                : t.changed,
      );
      router.refresh();
    });
  };

  const blockName = (key: string | null) => blocks.find((block) => block.key === key)?.name;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="items-h">
      <h2 id="items-h" className="text-lg font-semibold">
        {t.title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
            >
              {canEdit && blocks.length >= 0 && (
                <input
                  type="checkbox"
                  aria-label={m.events.blocks.pick}
                  checked={picked.includes(item.key)}
                  onChange={(event) =>
                    setPicked((now) =>
                      event.target.checked ? [...now, item.key] : now.filter((k) => k !== item.key),
                    )
                  }
                />
              )}
              <span className="text-sm text-muted tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1">
                {item.kind === "song" && item.arrangementId ? (
                  <a
                    className="underline"
                    href={`/munkater/kotta?arrangement=${item.arrangementId}${item.musicalKey ? `&key=${item.musicalKey}` : ""}`}
                    title={t.chart}
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
                {item.musicalKey && (
                  <span className="text-sm text-muted"> · {item.musicalKey}</span>
                )}
                {blockName(item.blockKey) && (
                  <span className="text-sm text-muted"> · {blockName(item.blockKey)}</span>
                )}
              </span>
              {canEdit && (
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || index === 0}
                    onClick={() => send(moveItemAction, { key: item.key, direction: "up" })}
                  >
                    {t.moveUp}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending || index === items.length - 1}
                    onClick={() => send(moveItemAction, { key: item.key, direction: "down" })}
                  >
                    {t.moveDown}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => send(removeItemAction, { key: item.key })}
                  >
                    {t.remove}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {notice && (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      )}

      {canEdit && (
        <>
          <form method="get" className="flex flex-col gap-2" role="search">
            <Label htmlFor="song-search">{t.searchLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="song-search"
                name="q"
                defaultValue={query}
                placeholder={t.searchPlaceholder}
              />
              <Button type="submit" variant="outline">
                {t.search}
              </Button>
            </div>
          </form>
          {query !== "" &&
            (results.length === 0 ? (
              <p className="text-sm text-muted">{t.noResults}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {results.map((song) => (
                  <li key={song.id} className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                    <span className="font-medium">{song.title}</span>
                    {song.arrangements.map((arrangement) => (
                      <span
                        key={arrangement.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-sm text-muted">
                          {arrangement.name}
                          {arrangement.key ? ` · ${arrangement.key}` : ""}
                        </span>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => send(addSongAction, { arrangementId: arrangement.id })}
                        >
                          {t.add}
                        </Button>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            ))}

          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              send(addTextItemAction, {
                title: String(form.get("title") ?? ""),
                notes: String(form.get("notes") ?? ""),
              });
              event.currentTarget.reset();
            }}
          >
            <Label htmlFor="text-title">{t.addText}</Label>
            <Input
              id="text-title"
              name="title"
              required
              maxLength={200}
              placeholder={t.textTitle}
            />
            <Input
              name="notes"
              maxLength={2000}
              placeholder={t.textNotes}
              aria-label={t.textNotes}
            />
            <Button type="submit" variant="outline" disabled={pending} className="self-start">
              {t.add}
            </Button>
          </form>

          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{m.events.blocks.title}</h3>
            {blocks.length === 0 && <p className="text-sm text-muted">{m.events.blocks.empty}</p>}
            <ul className="flex flex-col gap-1">
              {blocks.map((block) => (
                <li key={block.key} className="flex items-center justify-between gap-2 text-sm">
                  {block.name}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => send(deleteBlockAction, { key: block.key })}
                  >
                    {m.events.blocks.delete}
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = String(new FormData(event.currentTarget).get("name") ?? "");
                send(createBlockAction, { name, itemKeys: picked });
                setPicked([]);
                event.currentTarget.reset();
              }}
            >
              <Label htmlFor="block-name">{m.events.blocks.new}</Label>
              <p className="text-sm text-muted">{m.events.blocks.pick}</p>
              <Input
                id="block-name"
                name="name"
                required
                maxLength={80}
                placeholder={m.events.blocks.name}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={pending || picked.length === 0}
                className="self-start"
              >
                {m.events.blocks.create}
              </Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}

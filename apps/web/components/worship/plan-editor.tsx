"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { PlanItemInput } from "@churchy/contracts";
import { Alert, Badge, Button, Input, Select, Textarea } from "@churchy/ui";
import { useT } from "@/i18n/client";
import { ALL_KEYS, formatChord } from "@/lib/worship/music";
import { moveItem, totalMinutes } from "@/lib/worship/plan-flow";
import type { PolicyResult } from "@/server/policy";

const ITEM_TYPES = [
  "song",
  "liturgy",
  "reading",
  "prayer",
  "sermon",
  "announcement",
  "other",
] as const;
type ItemType = (typeof ITEM_TYPES)[number];

export interface EditorSong {
  id: string;
  title: string;
  /** `ÉE 101`-style references. */
  refs: string;
  defaultKey: string | null;
  /** Formatted date of the last time the song was sung, or null. */
  lastUsed: string | null;
  arrangements: { id: string; name: string; key: string }[];
}

export interface EditorItem {
  id?: string;
  type: ItemType;
  title: string;
  songId: string | null;
  arrangementId: string | null;
  keyOverride: string | null;
  verses: string | null;
  durationS: number | null;
  responsiblePersonId: string | null;
  notes: string | null;
}

type Row = EditorItem & { rowKey: string };
type Save = (planId: string, items: PlanItemInput[]) => Promise<PolicyResult<string>>;

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The item editor of a plan (D-66): add, reorder (drag and drop, or the *Fel* / *Le* buttons),
 * pick a song with its last use, override the key, set durations and a responsible person. The
 * list is saved as a whole; the duration total follows the edits.
 */
export function PlanEditor({
  planId,
  items,
  songs,
  people,
  save,
  notation,
}: {
  planId: string;
  items: readonly EditorItem[];
  songs: readonly EditorSong[];
  people: readonly { id: string; name: string }[];
  save: Save;
  notation: "hu" | "en";
}) {
  const t = useT("munkater.worship.editor");
  const router = useRouter();
  const uid = useId();
  const [rows, setRows] = useState<Row[]>(() => items.map((i, n) => ({ ...i, rowKey: `r${n}` })));
  const [next, setNext] = useState(items.length);
  const [open, setOpen] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [addType, setAddType] = useState<ItemType>("song");
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");
  const [announce, setAnnounce] = useState("");
  const [pending, startTransition] = useTransition();

  const songById = new Map(songs.map((s) => [s.id, s]));
  const change = (rowKey: string, patch: Partial<EditorItem>) => {
    setStatus("idle");
    setRows((all) => all.map((r) => (r.rowKey === rowKey ? { ...r, ...patch } : r)));
  };
  const move = (from: number, to: number) => {
    setStatus("idle");
    setRows((all) => moveItem(all, from, to));
    const row = rows[from];
    if (row)
      setAnnounce(
        t("moved", { title: row.title, position: Math.max(0, Math.min(rows.length - 1, to)) + 1 }),
      );
  };
  const add = () => {
    const rowKey = `n${next}`;
    setNext(next + 1);
    setStatus("idle");
    setRows((all) => [
      ...all,
      {
        rowKey,
        type: addType,
        title: t(`types.${addType}`),
        songId: null,
        arrangementId: null,
        keyOverride: null,
        verses: null,
        durationS: null,
        responsiblePersonId: null,
        notes: null,
      },
    ]);
    setOpen(rowKey);
  };
  const remove = (rowKey: string) => {
    setStatus("idle");
    setRows((all) => all.filter((r) => r.rowKey !== rowKey));
  };
  const pickSong = (row: Row, songId: string) => {
    const song = songById.get(songId);
    const wasSongTitle = row.songId !== null && songById.get(row.songId)?.title === row.title;
    change(row.rowKey, {
      songId: songId === "" ? null : songId,
      arrangementId: null,
      keyOverride: null,
      title:
        song && (wasSongTitle || row.title === t(`types.${row.type}`) || row.title === "")
          ? song.title
          : row.title,
    });
  };
  const persist = () => {
    startTransition(async () => {
      const payload: PlanItemInput[] = rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        type: r.type,
        title: r.title.trim() === "" ? t(`types.${r.type}`) : r.title.trim(),
        songId: r.type === "song" ? r.songId : null,
        arrangementId: r.type === "song" ? r.arrangementId : null,
        keyOverride: r.type === "song" ? r.keyOverride : null,
        verses: r.verses,
        durationS: r.durationS,
        responsiblePersonId: r.responsiblePersonId,
        notes: r.notes,
      }));
      const result = await save(planId, payload);
      if (result.ok && result.value === "ok") {
        setStatus("saved");
        router.refresh();
      } else {
        setStatus("failed");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="plan-editor">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {rows.length === 0 ? <p className="text-muted">{t("empty")}</p> : null}
      <ol className="flex flex-col gap-2" data-testid="plan-items">
        {rows.map((row, index) => {
          const song = row.songId ? songById.get(row.songId) : undefined;
          const isOpen = open === row.rowKey;
          const id = `${uid}-${row.rowKey}`;
          return (
            <li
              key={row.rowKey}
              draggable={armed === row.rowKey}
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => {
                if (dragFrom !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== index) move(dragFrom, index);
                setDragFrom(null);
                setArmed(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setArmed(null);
              }}
              className="rounded-card border border-hairline bg-surface-raised shadow-xs"
              data-testid="plan-item"
            >
              <div className="flex flex-wrap items-center gap-2 p-2">
                <span
                  aria-hidden="true"
                  title={t("drag")}
                  onMouseDown={() => setArmed(row.rowKey)}
                  onMouseUp={() => setArmed(null)}
                  className="inline-flex min-h-11 min-w-8 cursor-grab items-center justify-center text-muted select-none"
                >
                  ⋮⋮
                </span>
                <span className="w-6 text-right text-muted tabular-nums">{index + 1}.</span>
                <Badge>{t(`types.${row.type}`)}</Badge>
                <span className="min-w-0 flex-1 font-semibold" data-testid="plan-item-title">
                  {row.title}
                </span>
                {song ? (
                  <span className="text-muted">
                    {song.refs}
                    {(row.keyOverride ?? song.defaultKey)
                      ? ` · ${formatChord((row.keyOverride ?? song.defaultKey) as string, notation)}`
                      : ""}
                  </span>
                ) : null}
                {row.durationS ? (
                  <span className="text-muted tabular-nums">
                    {t("minutesShort", { minutes: Math.round(row.durationS / 60) })}
                  </span>
                ) : null}
                <span className="ml-auto flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label={t("up", { title: row.title })}
                    data-testid="item-up"
                  >
                    {t("upShort")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label={t("down", { title: row.title })}
                    data-testid="item-down"
                  >
                    {t("downShort")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-expanded={isOpen}
                    aria-controls={`${id}-panel`}
                    onClick={() => setOpen(isOpen ? null : row.rowKey)}
                    aria-label={t("edit", { title: row.title })}
                    data-testid="item-edit"
                  >
                    {t("editShort")}
                  </Button>
                </span>
              </div>
              {isOpen ? (
                <div
                  id={`${id}-panel`}
                  className="grid gap-3 border-t border-border p-3 md:grid-cols-2"
                >
                  <Select
                    label={t("fields.type")}
                    value={row.type}
                    onChange={(e) => change(row.rowKey, { type: e.target.value as ItemType })}
                    options={ITEM_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
                  />
                  <Input
                    label={t("fields.title")}
                    value={row.title}
                    onChange={(e) => change(row.rowKey, { title: e.target.value })}
                  />
                  {row.type === "song" ? (
                    <>
                      <SongPicker
                        songs={songs}
                        value={row.songId}
                        onChange={(songId) => pickSong(row, songId)}
                      />
                      <Select
                        label={t("fields.arrangement")}
                        value={row.arrangementId ?? ""}
                        placeholder={t("fields.noArrangement")}
                        onChange={(e) =>
                          change(row.rowKey, { arrangementId: e.target.value || null })
                        }
                        options={(song?.arrangements ?? []).map((a) => ({
                          value: a.id,
                          label: `${a.name} (${formatChord(a.key, notation)})`,
                        }))}
                      />
                      <Select
                        label={t("fields.key")}
                        value={row.keyOverride ?? ""}
                        placeholder={
                          song?.defaultKey
                            ? t("fields.keyDefault", {
                                key: formatChord(song.defaultKey, notation),
                              })
                            : t("fields.keyNone")
                        }
                        onChange={(e) =>
                          change(row.rowKey, { keyOverride: e.target.value || null })
                        }
                        options={ALL_KEYS.map((k) => ({
                          value: k,
                          label: formatChord(k, notation),
                        }))}
                      />
                      <Input
                        label={t("fields.verses")}
                        value={row.verses ?? ""}
                        onChange={(e) => change(row.rowKey, { verses: e.target.value || null })}
                      />
                    </>
                  ) : null}
                  <Input
                    label={t("fields.minutes")}
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.durationS === null ? "" : String(row.durationS / 60)}
                    onChange={(e) =>
                      change(row.rowKey, {
                        durationS:
                          e.target.value === "" ? null : Math.round(Number(e.target.value) * 60),
                      })
                    }
                  />
                  <Select
                    label={t("fields.responsible")}
                    value={row.responsiblePersonId ?? ""}
                    placeholder={t("fields.nobody")}
                    onChange={(e) =>
                      change(row.rowKey, { responsiblePersonId: e.target.value || null })
                    }
                    options={people.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label={t("fields.notes")}
                      rows={2}
                      value={row.notes ?? ""}
                      onChange={(e) => change(row.rowKey, { notes: e.target.value || null })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => remove(row.rowKey)}
                      data-testid="item-remove"
                    >
                      {t("remove")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48">
          <Select
            label={t("addType")}
            value={addType}
            onChange={(e) => setAddType(e.target.value as ItemType)}
            options={ITEM_TYPES.map((v) => ({ value: v, label: t(`types.${v}`) }))}
          />
        </div>
        <Button type="button" variant="secondary" onClick={add} data-testid="item-add">
          {t("add")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <p className="font-semibold" data-testid="plan-total">
          {t("total", { minutes: totalMinutes(rows) })}
        </p>
        <Button type="button" onClick={persist} disabled={pending} data-testid="plan-save">
          {t("save")}
        </Button>
        <span role="status" className="text-muted" data-testid="plan-save-status">
          {status === "saved" ? t("saved") : ""}
        </span>
      </div>
      {status === "failed" ? (
        <Alert tone="danger" title={t("failedTitle")}>
          <p>{t("failedBody")}</p>
        </Alert>
      ) : null}
    </div>
  );
}

/** Filter box + select with *last used* info for every song (D-66 AC2). */
function SongPicker({
  songs,
  value,
  onChange,
}: {
  songs: readonly EditorSong[];
  value: string | null;
  onChange: (songId: string) => void;
}) {
  const t = useT("munkater.worship.editor");
  const [filter, setFilter] = useState("");
  const needle = fold(filter);
  const shown = songs.filter(
    (s) => s.id === value || needle === "" || fold(`${s.title} ${s.refs}`).includes(needle),
  );
  return (
    <div className="flex flex-col gap-2">
      <Input
        label={t("fields.songSearch")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <Select
        label={t("fields.song")}
        value={value ?? ""}
        placeholder={t("fields.noSong")}
        onChange={(e) => onChange(e.target.value)}
        options={shown.map((s) => ({
          value: s.id,
          label: `${s.refs ? `${s.refs} – ` : ""}${s.title}${
            s.lastUsed ? ` · ${t("lastUsed", { date: s.lastUsed })}` : ""
          }`,
        }))}
      />
    </div>
  );
}

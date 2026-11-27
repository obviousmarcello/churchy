"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircleIcon, XIcon } from "lucide-react";

import { AutoSaveStatus } from "@/components/music/form-parts";
import { DurationInput } from "@/components/music/run-sheet";
import { invalidatePageCache } from "@/components/music/page-cache";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { useI18n } from "@/i18n/music/client";
import { EVENT_BLOCK_NAME_MAX_LENGTH, type EventBlock } from "@/lib/music/event-blocks";
import { changedPages } from "@/lib/music/page-keys";
import { updateEventBlockAction } from "./actions-client";

/** A typed change saves this long after the last key, and on blur. */
const TYPING_SAVE_DELAY_MS = 3000;

type Details = { name: string; durationSeconds: number | null };

/**
 * The header of a block in the items editor, edited in place: its name and
 * the planned time of the whole block (empty: the times of its items). Each
 * block counts down its time from its start (the countdown "remaining").
 * Each field saves by itself (auto-save): on blur and 3 s after the last key.
 * Only "Saving…" and a failed save show. The X removes the block; the items
 * stay. `autoFocus`: the name field gets the focus, e.g. for a new block.
 */
export function BlockEditor({
  eventId,
  block,
  plan,
  autoFocus,
  editSlot,
  onFocused,
  removing,
  onUngroup,
}: {
  eventId: string;
  block: EventBlock;
  plan: { seconds: number; unknown: number; count: number };
  autoFocus: boolean;
  /** The songs have an edit button before their remove button: the X of the block stays above their X. */
  editSlot: boolean;
  /** The name field got the focus of `autoFocus`. */
  onFocused: () => void;
  /** The X removes the block now: a spinner in its place, and no second click. */
  removing: boolean;
  onUngroup: () => void;
}) {
  const { m, format } = useI18n();
  const t = m.components.eventBlocks;
  const [name, setName] = useState(block.name);
  const [durationSeconds, setDurationSeconds] = useState(block.durationSeconds ?? null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  /** The details of the last save that failed, for "Try again". */
  const [failed, setFailed] = useState<{ details: Details; message: string } | null>(null);
  /** Only the result of the last save counts. */
  const sequence = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The typed change that waits for its save. While it waits, the leave guard asks. */
  const waitingChange = useRef<Partial<Details> | null>(null);
  const [waiting, setWaiting] = useState(false);
  /** The values on the server, as this header knows them. */
  const saved = useRef<Details>({
    name: block.name,
    durationSeconds: block.durationSeconds ?? null,
  });

  // A change of another user shows here, unless the user types in the name now.
  const [editingName, setEditingName] = useState(false);
  const [known, setKnown] = useState(block);
  if (known.name !== block.name || known.durationSeconds !== block.durationSeconds) {
    setKnown(block);
    if (!editingName) setName(block.name);
    setDurationSeconds(block.durationSeconds ?? null);
  }
  useLayoutEffect(() => {
    saved.current = { name: block.name, durationSeconds: block.durationSeconds ?? null };
  }, [block.name, block.durationSeconds]);

  const onFocusedRef = useRef(onFocused);
  useLayoutEffect(() => {
    onFocusedRef.current = onFocused;
  });
  useEffect(() => {
    if (!autoFocus) return;
    nameRef.current?.select();
    onFocusedRef.current();
  }, [autoFocus]);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function save(details: Details) {
    clearTimeout(timer.current);
    waitingChange.current = null;
    setWaiting(false);
    const current = saved.current;
    if (details.name === current.name && details.durationSeconds === current.durationSeconds)
      return;
    const mine = ++sequence.current;
    setSaving((count) => count + 1);
    invalidatePageCache(changedPages.event(eventId));
    try {
      // Each block counts down its time: the other kinds of countdown are not in the app.
      const state = await updateEventBlockAction(eventId, block.key, {
        ...details,
        countdown: "remaining",
        until: null,
      });
      if (mine !== sequence.current) return;
      if (state.status === "success") {
        saved.current = details;
        setFailed(null);
      } else {
        setFailed({
          details,
          message: Object.values(state.fieldErrors).flat()[0] ?? state.message ?? "",
        });
      }
    } catch {
      if (mine === sequence.current)
        setFailed({ details, message: m.events.actions.blockSaveFailed });
    } finally {
      setSaving((count) => count - 1);
    }
  }

  /** The details with the change of a field. An empty name does not save: the field says why. */
  function details(next: Partial<Details>): Details | null {
    const value = { name: name.trim(), durationSeconds, ...next };
    if (!value.name) {
      setNameError(t.nameRequired);
      return null;
    }
    setNameError(null);
    return value;
  }

  function saveTyped(next: Partial<Details>, delay: number) {
    clearTimeout(timer.current);
    waitingChange.current = next;
    setWaiting(true);
    timer.current = setTimeout(saveWaiting, delay);
  }

  /** Saves the waiting typed change now. An empty name does not save. */
  function saveWaiting() {
    const next = waitingChange.current;
    clearTimeout(timer.current);
    waitingChange.current = null;
    setWaiting(false);
    if (!next) return;
    const value = details(next);
    if (value) void save(value);
  }

  const label = name.trim() || block.name;
  const nameErrorId = `${block.key}-name-error`;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={nameRef}
          aria-label={format(t.nameOf, { name: block.name })}
          value={name}
          maxLength={EVENT_BLOCK_NAME_MAX_LENGTH}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          onChange={(event) => {
            setName(event.target.value);
            saveTyped({ name: event.target.value.trim() }, TYPING_SAVE_DELAY_MS);
          }}
          onFocus={() => setEditingName(true)}
          onBlur={(event) => {
            setEditingName(false);
            saveTyped({ name: event.target.value.trim() }, 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 w-48 font-semibold"
        />
        {/* In the columns of the items: the time field above their time fields, the X above their remove buttons. */}
        <div className="ml-auto flex items-center gap-2">
          {/* The planned time of the whole block, e.g. 20 minutes for the worship. Empty: the times of its items. */}
          <span
            onBlur={() => {
              const value = details({ durationSeconds });
              if (value) void save(value);
            }}
          >
            <DurationInput
              value={durationSeconds}
              fallback={plan.seconds > 0 ? plan.seconds : null}
              label={format(t.durationOf, { name: label })}
              hint={t.durationHint}
              onChange={(seconds) => {
                setDurationSeconds(seconds);
                saveTyped({ durationSeconds: seconds }, TYPING_SAVE_DELAY_MS);
              }}
            />
          </span>
          <div className="flex h-8 shrink-0 items-center gap-1">
            {/* The place of the edit button of a song. */}
            {editSlot && <span aria-hidden className="size-7 pointer-coarse:size-8" />}
            {/* As the remove button of an item. The items stay. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={format(t.ungroupOf, { name: label })}
              title={t.ungroup}
              aria-disabled={removing || undefined}
              onClick={() => !removing && onUngroup()}
            >
              {removing ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <XIcon />}
            </Button>
          </div>
        </div>
      </div>
      {nameError && (
        <p id={nameErrorId} className="text-sm text-danger">
          {nameError}
        </p>
      )}
      <AutoSaveStatus
        saving={saving > 0}
        waiting={waiting}
        onSaveNow={saveWaiting}
        // The header shows the saved values: no "Change saved".
        savedCount={0}
        failedCount={failed ? 1 : 0}
        detail={failed?.message}
        onRetry={() => failed && void save(failed.details)}
        onDiscard={() => {
          setFailed(null);
          setName(saved.current.name);
          setDurationSeconds(saved.current.durationSeconds);
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";

import { STOPPED_GRID, type BeatGrid } from "@/lib/music/live/beat-grid";
import { ServerClock } from "@/lib/music/live/clock-sync";
import type { LivePosition, LiveState } from "@/lib/music/live/protocol";

// Music Sheet DB's `useLiveSession` joins a Supabase Realtime channel (the leader's song, place, keys
// and shared metronome). The realtime transport of Churchy is not decided yet (PLAN §11, open), so
// live sessions are not merged: this keeps the hook's shape, and the sheet never has a session
// (`active: false`). The pure parts (`lib/music/live/*`) are copied for the day it comes.

export type LiveStatus = "connecting" | "live" | "ended" | "failed";

export type LiveSession = ReturnType<typeof useLiveSession>;

/** Always without a session until live sessions come. */
export function useLiveSession(_session: null) {
  const [clock] = useState(() => new ServerClock());
  const state: LiveState | null = null;
  const status = "ended" as LiveStatus;
  return {
    active: false,
    status,
    clock,
    isLeader: false,
    state: state as LiveState | null,
    following: false,
    setFollowing(_following: boolean) {},
    setKey(_songId: string, _key: string | null) {},
    setPosition(_position: LivePosition) {},
    setGrid(_grid: BeatGrid) {},
    grid: STOPPED_GRID,
  };
}

import { getDemoState } from "@/server/demo";

/**
 * The current instant of this request: the real time, or in demo mode the visitor's demo clock
 * (`churchy_demo_now` cookie, D-13) — the same clock the demo repositories read, so time-sensitive
 * public pages (home "next services", D-10) and the data behind them agree. Every time-dependent
 * label is computed from this per request, never baked into a cached page, so *Ma/Holnap* are
 * right after midnight without any edit.
 */
export async function getRequestNow(): Promise<Date> {
  return (await getDemoState())?.nowOverride ?? new Date();
}

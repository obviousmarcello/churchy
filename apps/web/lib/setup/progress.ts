import { ImportEventSchema, type ImportEvent, type ImportStage } from "@churchy/contracts";

/**
 * Progress of the running import as the wizard shows it (animation and live text). Pure: the
 * stream of `ImportEvent`s folds into this state.
 */
export interface ImportProgress {
  completed: readonly ImportStage[];
  /** The stage in progress. */
  running: ImportStage | null;
  counts: Partial<Record<ImportStage, number>>;
}

export const INITIAL_PROGRESS: ImportProgress = { completed: [], running: null, counts: {} };

export function reduceProgress(state: ImportProgress, event: ImportEvent): ImportProgress {
  if (event.type !== "stage") return { ...state, running: null };
  if (event.status === "started") return { ...state, running: event.stage };
  return {
    completed: state.completed.includes(event.stage)
      ? state.completed
      : [...state.completed, event.stage],
    running: state.running === event.stage ? null : state.running,
    counts:
      event.count === undefined ? state.counts : { ...state.counts, [event.stage]: event.count },
  };
}

export interface ImportStreamOptions {
  /** Route that streams the job as NDJSON (`GET ?url=`). The seam towards the server's `ImportJob`. */
  endpoint: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

function parseLine(line: string): ImportEvent | null {
  try {
    const parsed = ImportEventSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Reads the NDJSON stream of an import job into events. Lines that are not valid events are
 * dropped; a transport failure ends the stream with `failed: unreachable`.
 */
export async function* streamImport(
  url: string,
  { endpoint, signal, fetchImpl = fetch }: ImportStreamOptions,
): AsyncGenerator<ImportEvent> {
  try {
    const response = await fetchImpl(`${endpoint}?url=${encodeURIComponent(url)}`, { signal });
    if (!response.ok || response.body === null) {
      yield { type: "failed", code: "unreachable" };
      return;
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      buffer += value ?? "";
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const event = line.trim() === "" ? null : parseLine(line);
        if (event) yield event;
      }
      if (done) return;
    }
  } catch {
    if (!signal?.aborted) yield { type: "failed", code: "unreachable" };
  }
}

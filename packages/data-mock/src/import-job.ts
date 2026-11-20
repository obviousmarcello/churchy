import {
  IMPORT_STAGES,
  parseImportUrl,
  type ImportEvent,
  type ImportJob,
  type ImportResult,
  type ImportStage,
} from "@churchy/contracts";

/**
 * Mock `ImportJob` (D-34): replays a scripted import of a fictitious free church (baptist
 * preset). Any web address is accepted and **nothing is fetched** — the network is never touched.
 * A real importer implements the same `ImportJob` interface and replaces this one in
 * `apps/web/server/data-adapters.ts`.
 */

/** The scripted result; several items are on purpose below the confidence threshold. */
export function mockImportResult(sourceUrl: string, now: Date = new Date()): ImportResult {
  return {
    sourceUrl,
    importedAt: now.toISOString(),
    pagesRead: 14,
    church: {
      name: { value: "Szilvásréti Szabadegyházi Gyülekezet", confidence: 0.97 },
      shortName: { value: "Szilvásréti Gyülekezet", confidence: 0.9 },
      tagline: { value: "Nyitott ajtó, nyitott szív", confidence: 0.64 },
      denomination: { value: "bapt", confidence: 0.86 },
    },
    terminology: {
      leadClergy: {
        value: {
          nom: "Pásztor",
          lower: "pásztor",
          slug: "pasztor",
          plural: "pásztorok",
          article: "a",
        },
        confidence: 0.58,
      },
    },
    serviceTimes: [
      {
        id: "st-1",
        label: "Istentisztelet",
        weekday: 7,
        time: "10:00",
        location: "loc-1",
        confidence: 0.96,
      },
      {
        id: "st-2",
        label: "Imaóra",
        weekday: 3,
        time: "18:30",
        location: "loc-1",
        confidence: 0.88,
      },
      {
        id: "st-3",
        label: "Ifjúsági alkalom",
        weekday: 5,
        time: "19:00",
        location: "loc-2",
        confidence: 0.55,
      },
    ],
    locations: [
      {
        id: "loc-1",
        name: "Imaház",
        address: { postalCode: "2999", city: "Szilvásrét", line1: "Almafa utca 7.", line2: null },
        confidence: 0.94,
      },
      {
        id: "loc-2",
        name: "Közösségi ház",
        address: { postalCode: "2999", city: "Szilvásrét", line1: "Kert sor 3.", line2: null },
        confidence: 0.62,
      },
    ],
    contact: {
      email: { value: "iroda@szilvasret-gyulekezet.example.test", confidence: 0.93 },
      phone: { value: "+36 30 555 0142", confidence: 0.8 },
    },
    theme: {
      value: {
        themeId: "kozossegi",
        colors: { primary: "#1f5a8c", secondary: "#e0a030" },
        fontPairing: "modern-sans",
        heroStyle: "image-split",
        radius: "large",
      },
      confidence: 0.6,
    },
    staff: [
      { id: "p-1", name: "Mintás Gergely", role: "Pásztor", hasPhoto: true, confidence: 0.91 },
      { id: "p-2", name: "Példa Réka", role: "Ifjúsági vezető", hasPhoto: true, confidence: 0.84 },
      { id: "p-3", name: "Tesztes Ádám", role: "Gondnok", hasPhoto: false, confidence: 0.67 },
    ],
  };
}

export interface MockImportJobOptions {
  /** Pause before each stage completes, in milliseconds (default 700; 0 in unit tests). */
  stageDelayMs?: number;
  now?: () => Date;
}

const STAGE_COUNTS: Partial<Record<ImportStage, number>> = {
  pages: 14,
  serviceTimes: 3,
  contacts: 2,
};

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function createMockImportJob(options: MockImportJobOptions = {}): ImportJob {
  const { stageDelayMs = 700, now = () => new Date() } = options;
  return {
    async *start(url, { signal } = {}): AsyncGenerator<ImportEvent> {
      const sourceUrl = parseImportUrl(url);
      if (sourceUrl === null) {
        yield { type: "failed", code: "invalid_url" };
        return;
      }
      for (const stage of IMPORT_STAGES) {
        if (signal?.aborted) return;
        yield { type: "stage", stage, status: "started" };
        await pause(stageDelayMs, signal);
        if (signal?.aborted) return;
        const count = STAGE_COUNTS[stage];
        yield {
          type: "stage",
          stage,
          status: "completed",
          ...(count === undefined ? {} : { count }),
        };
      }
      yield { type: "result", result: mockImportResult(sourceUrl, now()) };
    },
  };
}

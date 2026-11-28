import { describe, expect, it } from "vitest";
import {
  IMPORT_STAGES,
  ImportEventSchema,
  ImportResultSchema,
  type ImportEvent,
  type ImportJob,
} from "../modules/import";

async function collect(job: ImportJob, url: string, signal?: AbortSignal): Promise<ImportEvent[]> {
  const events: ImportEvent[] = [];
  for await (const event of job.start(url, signal ? { signal } : undefined)) events.push(event);
  return events;
}

/**
 * Contract of an `ImportJob` (D-34): every importer, mock or real, must stream each stage in
 * order (`started` then `completed`), end with exactly one terminal event and return a result
 * that satisfies `ImportResultSchema`.
 */
export function importJobContract(name: string, create: () => ImportJob): void {
  describe(`import job (${name})`, () => {
    it("streams every stage in order and ends with a valid result", async () => {
      const events = await collect(create(), "https://pelda.example.test");
      for (const event of events) expect(ImportEventSchema.safeParse(event).success).toBe(true);

      const stages = events.flatMap((e) => (e.type === "stage" ? [e] : []));
      expect(stages.map((e) => `${e.stage}:${e.status}`)).toEqual(
        IMPORT_STAGES.flatMap((s) => [`${s}:started`, `${s}:completed`]),
      );

      const last = events.at(-1);
      expect(last?.type).toBe("result");
      expect(events.filter((e) => e.type !== "stage")).toHaveLength(1);
      if (last?.type === "result") {
        expect(ImportResultSchema.safeParse(last.result).success).toBe(true);
        expect(last.result.sourceUrl).toContain("pelda.example.test");
      }
    });

    it("fails with invalid_url for an address that is not a web address", async () => {
      const events = await collect(create(), "nem cím");
      expect(events).toEqual([{ type: "failed", code: "invalid_url" }]);
    });

    it("stops early when the signal is aborted", async () => {
      const controller = new AbortController();
      controller.abort();
      const events = await collect(create(), "https://pelda.example.test", controller.signal);
      expect(events.some((e) => e.type === "result")).toBe(false);
    });
  });
}

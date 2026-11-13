/**
 * The dataset a demo session starts from. Indirection point for the demo seed (issue #16): until
 * `src/seed/` is merged this returns an empty dataset so the app builds and runs; the merge of
 * #16 replaces the body with the seed's `MockDataset` (one line), and nothing else changes.
 */
import type { MockDataset } from "./dataset";
import { emptyDataset } from "./dataset";

export function defaultDemoDataset(): MockDataset {
  return emptyDataset();
}

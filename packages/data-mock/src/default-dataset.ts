/**
 * The dataset a demo session starts from: the fictitious Hungarian demo seed (#16), anchored on
 * the current time so services, events and bookings are always "upcoming".
 */
import type { MockDataset } from "./dataset";
import { createDemoDataset } from "./seed";

export function defaultDemoDataset(now: Date = new Date()): MockDataset {
  return createDemoDataset(now);
}

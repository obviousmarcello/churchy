/**
 * Plan catalog seed (`db seed-plans`): the five plans of SDD §19.1 (ingyenes, teljes, ws_s50,
 * ws_m150, ws_l300) with their entitlements, taken from the demo fixtures.
 *
 * PLACEHOLDERS: the prices are dev/staging values, to be set before launch. It is catalog data,
 * no demo data; no migration or test database depends on it. Idempotent (ON CONFLICT DO UPDATE),
 * must run as the schema owner (the platform role cannot write `plans`).
 */
import { createDemoDataset } from "@churchy/data-mock";
import { sql } from "drizzle-orm";
import type { Db } from "../client";
import * as s from "../schema";

export async function seedPlans(db: Db, now: Date = new Date()): Promise<number> {
  const plans = createDemoDataset(now).plans;
  for (const p of plans) {
    await db
      .insert(s.plans)
      .values(p)
      .onConflictDoUpdate({
        target: s.plans.key,
        set: {
          name: sql`excluded.name`,
          kind: sql`excluded.kind`,
          priceMonthly: sql`excluded.price_monthly`,
          priceYearly: sql`excluded.price_yearly`,
          entitlements: sql`excluded.entitlements`,
        },
      });
  }
  return plans.length;
}

/**
 * In-app notifications and per-user channel preferences (SDD §26.1). Payloads carry no sensitive
 * content (D-54 AC4; the contract restricts them to short scalars).
 */
import type { Notification } from "@churchy/contracts";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { idColumn, tenantIndexes, timestamptz } from "./columns";
import { notificationChannel, notificationKind } from "./enums";
import { profiles, tenantId } from "./platform";

export const notifications = pgTable(
  "notifications",
  {
    id: idColumn(),
    tenantId: tenantId(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    payload: jsonb().$type<Notification["payload"]>().notNull().default({}),
    link: text().notNull(),
    createdAt: timestamptz().notNull().defaultNow(),
    readAt: timestamptz(),
  },
  (t) => [
    ...tenantIndexes("notifications", t),
    index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt),
    check("notifications_link_check", sql`${t.link} ~ '^/\\S*$'`),
  ],
).enableRLS();

/** User-level (not tenant-level) preferences. */
export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    userId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: notificationKind().notNull(),
    channels: notificationChannel().array().notNull(),
    digest: boolean().notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
).enableRLS();

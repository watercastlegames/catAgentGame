import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const relayDevices = sqliteTable(
  "relay_devices",
  {
    deviceId: text("device_id").primaryKey(),
    secretHash: text("secret_hash").notNull(),
    pairingCodeHash: text("pairing_code_hash").notNull(),
    pairingExpiresAt: integer("pairing_expires_at").notNull(),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    lastSeenAt: integer("last_seen_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("relay_devices_pairing_idx").on(
      table.pairingCodeHash,
      table.pairingExpiresAt,
    ),
    index("relay_devices_seen_idx").on(table.lastSeenAt),
  ],
);

export const relayBrowserSessions = sqliteTable(
  "relay_browser_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    deviceId: text("device_id")
      .notNull()
      .references(() => relayDevices.deviceId, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("relay_browser_sessions_token_idx").on(table.tokenHash),
    index("relay_browser_sessions_device_idx").on(table.deviceId),
  ],
);

export const relayCommands = sqliteTable(
  "relay_commands",
  {
    id: text("id").primaryKey(),
    deviceId: text("device_id")
      .notNull()
      .references(() => relayDevices.deviceId, { onDelete: "cascade" }),
    method: text("method").notNull(),
    path: text("path").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status").notNull().default("queued"),
    resultJson: text("result_json"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at").notNull(),
    claimedAt: integer("claimed_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("relay_commands_queue_idx").on(
      table.deviceId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const relayEvents = sqliteTable(
  "relay_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: text("device_id")
      .notNull()
      .references(() => relayDevices.deviceId, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("relay_events_device_idx").on(table.deviceId, table.id),
  ],
);

export const relayPairAttempts = sqliteTable(
  "relay_pair_attempts",
  {
    clientHash: text("client_hash").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
);

export const companyCliQuotaHourly = sqliteTable(
  "company_cli_quota_hourly",
  {
    deviceId: text("device_id").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
);

export const companyCliQuotaDaily = sqliteTable(
  "company_cli_quota_daily",
  {
    scope: text("scope").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleSub: text("google_sub"),
    oaiUserEmail: text("oai_user_email"),
    email: text("email").notNull(),
    createdAt: integer("created_at").notNull(),
    lastLoginAt: integer("last_login_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_google_sub_idx").on(table.googleSub),
    uniqueIndex("users_oai_email_idx").on(table.oaiUserEmail),
  ],
);

export const userSessions = sqliteTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("user_sessions_token_idx").on(table.tokenHash),
    index("user_sessions_user_idx").on(table.userId),
  ],
);

export const playerShellDeltaLog = sqliteTable(
  "player_shell_delta_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    appliedAt: integer("applied_at").notNull(),
  },
  (table) => [
    index("shell_delta_user_idx").on(table.userId, table.appliedAt),
  ],
);

export const catNeedState = sqliteTable(
  "cat_need_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    catThreadId: text("cat_thread_id").notNull(),
    hunger: integer("hunger").notNull().default(0),
    toilet: integer("toilet").notNull().default(0),
    happiness: integer("happiness").notNull().default(30),
    lastComputedAt: integer("last_computed_at").notNull(),
  },
  (table) => [
    uniqueIndex("cat_need_state_user_thread_idx").on(
      table.userId,
      table.catThreadId,
    ),
  ],
);

export const workstationDecorState = sqliteTable(
  "workstation_decor_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    ownedItemIdsJson: text("owned_item_ids_json").notNull().default("[]"),
    seatsJson: text("seats_json").notNull().default("{}"),
    updatedAt: integer("updated_at").notNull(),
  },
);

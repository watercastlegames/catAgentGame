import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [schema, worker, syncWorker, storage, migration] = await Promise.all([
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/player-sync.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/storage.ts", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0001_curved_korg.sql", import.meta.url), "utf8"),
]);

test("ships the authenticated D1 player-state schema without changing relay tables", () => {
  assert.match(schema, /export const users = sqliteTable/);
  assert.match(schema, /export const playerShellDeltaLog = sqliteTable/);
  assert.match(schema, /export const catNeedState = sqliteTable/);
  assert.match(schema, /catThreadId: text\("cat_thread_id"\)/);
  assert.match(schema, /export const workstationDecorState = sqliteTable/);
  assert.match(schema, /export const relayDevices = sqliteTable/);
  assert.match(migration, /CREATE TABLE `users`/);
  assert.match(migration, /CREATE TABLE `cat_need_state`/);
  assert.match(migration, /CREATE TABLE `player_shell_delta_log`/);
});

test("exposes bootstrap, pull, and idempotent push sync routes", () => {
  assert.match(worker, /handlePlayerSyncRequest/);
  assert.match(syncWorker, /\/api\/sync\/bootstrap/);
  assert.match(syncWorker, /\/api\/sync\/pull/);
  assert.match(syncWorker, /\/api\/sync\/push/);
  assert.match(syncWorker, /oai-authenticated-user-email/);
  assert.match(syncWorker, /ON CONFLICT\(id\) DO NOTHING/);
  assert.match(
    syncWorker,
    /ON CONFLICT\(user_id, cat_thread_id\) DO UPDATE SET/,
  );
  assert.match(syncWorker, /NEEDS_OFFLINE_CAP_MS = 12 \* 60 \* 60_000/);
});

test("keeps local storage primary and queues cloud shadow writes", () => {
  assert.match(storage, /agent-forest-cloud-sync-queue-v1/);
  assert.match(storage, /recordShellDelta/);
  assert.match(storage, /recordCatNeeds/);
  assert.match(storage, /recordDecor/);
  assert.match(storage, /keepalive: true/);
  assert.match(storage, /initial-local-import/);
});

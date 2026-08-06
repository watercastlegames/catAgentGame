import assert from "node:assert/strict";
import test from "node:test";

import { SessionListCache } from "../bridge/session-list-cache.mjs";

test("session list cache reuses a fresh result", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new SessionListCache({ ttlMs: 4_000, now: () => now });
  const loader = async () => ({ data: [++loads] });

  assert.deepEqual(await cache.get("20:first", loader), { data: [1] });
  now += 3_999;
  assert.deepEqual(await cache.get("20:first", loader), { data: [1] });
  assert.equal(loads, 1);
});

test("session list cache combines concurrent Codex requests", async () => {
  let resolveLoad;
  let loads = 0;
  const cache = new SessionListCache();
  const loader = () => {
    loads += 1;
    return new Promise((resolve) => {
      resolveLoad = resolve;
    });
  };

  const first = cache.get("20:first", loader);
  const second = cache.get("20:first", loader);
  await Promise.resolve();
  resolveLoad({ data: ["ready"] });

  assert.deepEqual(await Promise.all([first, second]), [
    { data: ["ready"] },
    { data: ["ready"] },
  ]);
  assert.equal(loads, 1);
});

test("session list cache reloads after expiry or invalidation", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new SessionListCache({ ttlMs: 10, now: () => now });
  const loader = async () => ++loads;

  assert.equal(await cache.get("20:first", loader), 1);
  now += 10;
  assert.equal(await cache.get("20:first", loader), 2);
  cache.clear();
  assert.equal(await cache.get("20:first", loader), 3);
});

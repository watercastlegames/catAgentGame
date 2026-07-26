import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PairingAttemptLimiter,
  PairingStore,
} from "../bridge/pairing-store.mjs";

test("persists only hashed companion tokens across bridge restarts", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-forest-pairing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "pairing.json");
  const token = "plain-token-that-must-not-be-on-disk";

  const first = new PairingStore(filePath);
  first.addToken(token);
  assert.equal(first.hasToken(token), true);
  const disk = await readFile(filePath, "utf8");
  assert.doesNotMatch(disk, new RegExp(token));

  const restarted = new PairingStore(filePath);
  assert.equal(restarted.pairingCode, first.pairingCode);
  assert.equal(restarted.hasToken(token), true);
});

test("blocks the twenty-first pairing attempt in one window", () => {
  const limiter = new PairingAttemptLimiter({ limit: 20, windowMs: 60_000 });
  for (let index = 0; index < 20; index += 1) {
    assert.equal(limiter.check("127.0.0.1", index), true);
  }
  assert.equal(limiter.check("127.0.0.1", 20), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  readCodexSessionCache,
  writeCodexSessionCache,
} from "../app/codex-session-cache.mjs";

const SESSION = {
  id: "019f8f11-5655-78b2-9e73-0208dad74f2c",
  sessionId: "019f8f11-5655-78b2-9e73-0208dad74f2c",
  provider: "codex",
  title: "고양이 개발",
  preview: "Agent Forest 작업",
  projectName: "catAgentGame",
  status: "idle",
  activeFlags: [],
  source: "cli",
  modelProvider: "openai",
  updatedAt: "2026-08-04T00:00:00.000Z",
  createdAt: "2026-08-03T00:00:00.000Z",
  ephemeral: false,
  canAcceptDirectInput: true,
};

test("Codex sessions survive the instant-display browser cache", () => {
  const saved = writeCodexSessionCache([SESSION], 10_000);
  assert.deepEqual(readCodexSessionCache(saved, 10_001), [SESSION]);
});

test("invalid and expired Codex session caches fail closed", () => {
  assert.deepEqual(readCodexSessionCache("broken", 10_000), []);
  const saved = writeCodexSessionCache([SESSION], 10_000);
  assert.deepEqual(
    readCodexSessionCache(saved, 10_000 + 8 * 24 * 60 * 60 * 1_000),
    [],
  );
});

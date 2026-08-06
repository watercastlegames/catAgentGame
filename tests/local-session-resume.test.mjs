import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const server = await readFile(
  new URL("../bridge/server.mjs", import.meta.url),
  "utf8",
);

test("new and already-loaded Codex sessions skip redundant resume calls", () => {
  assert.match(server, /const loadedThreadIds = new Set\(\)/);
  assert.match(server, /loadedThreadIds\.add\(result\.thread\.id\)/);
  assert.match(server, /if \(loadedThreadIds\.has\(threadId\)\) return/);
  assert.match(server, /await ensureThreadLoaded\(client, threadId\)/);
});

test("normal persisted sessions receive a bounded resume window", () => {
  assert.match(server, /THREAD_RESUME_TIMEOUT_MS = 60_000/);
  assert.match(
    server,
    /"thread\/resume",\s*\{ threadId \},\s*THREAD_RESUME_TIMEOUT_MS/,
  );
});

test("oversized persisted sessions roll into a fresh lightweight thread", () => {
  assert.match(server, /inspectThreadRollout\(codexSessionsRoot, threadId\)/);
  assert.match(server, /readRecentConversation\(rollout\.filePath\)/);
  assert.match(server, /buildRolloverPrompt/);
  assert.match(server, /replacedThreadId: threadId/);
});

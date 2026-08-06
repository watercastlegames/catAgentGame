import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, page, backends] = await Promise.all([
  readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/companion-backends.ts", import.meta.url), "utf8"),
]);

test("bridge exposes authenticated Claude Code beside Codex App Server", () => {
  assert.match(server, /new ClaudeCodeAdapter/);
  assert.match(server, /claudeAvailable/);
  assert.match(server, /provider: "codex-app-server\+claude-code"/);
  assert.match(server, /isClaudeThreadId\(threadId\)/);
  assert.match(server, /startClaudeTurn/);
  assert.match(server, /claudeAdapter\.interrupt\(threadId\)/);
});

test("UI lets each cat select and run a local Claude session", () => {
  assert.match(backends, /id: "local-claude"/);
  assert.match(backends, /Claude Code \(내 PC\)/);
  assert.match(page, /refreshSessions\(selectedLocalProvider\)/);
  assert.match(page, /provider=\$\{provider\}/);
  assert.match(page, /chargeChatShells\("local-claude-chat"\)/);
  assert.match(page, /refundChatShells\("local-claude-chat-refund"\)/);
  assert.match(page, /selectedLocalProviderLabel/);
});

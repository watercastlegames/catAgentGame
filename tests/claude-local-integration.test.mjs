import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [server, page, backends] = await Promise.all([
  readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/companion-backends.ts", import.meta.url), "utf8"),
]);
const mapper = await readFile(
  new URL("../bridge/claude-event-mapper.mjs", import.meta.url),
  "utf8",
);
const adapter = await readFile(
  new URL("../bridge/claude-code-adapter.mjs", import.meta.url),
  "utf8",
);

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

test("Claude fallback replies return to the original cat conversation", () => {
  assert.match(server, /conversationThreadId/);
  assert.match(mapper, /context\.conversationThreadId \?\? context\.threadId/);
});

test("Claude prompts cross the Windows launcher as UTF-8 stdin", () => {
  assert.match(adapter, /stdio: \["pipe", "pipe", "pipe"\]/);
  assert.match(adapter, /child\.stdin\.end\(Buffer\.from\(prompt, "utf8"\)\)/);
  assert.doesNotMatch(adapter, /args\.push\("--", prompt\)/);
});

test("SSE subscribers remain connected until the response closes", () => {
  assert.match(server, /response\.on\("close", \(\) => clients\.delete\(response\)\)/);
  assert.doesNotMatch(server, /request\.on\("close", \(\) => clients\.delete\(response\)\)/);
});

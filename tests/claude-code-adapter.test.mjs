import assert from "node:assert/strict";
import test from "node:test";

import {
  fromClaudeThreadId,
  isClaudeThreadId,
  parseClaudeHistory,
  toClaudeThreadId,
} from "../bridge/claude-code-adapter.mjs";
import { mapClaudeMessage } from "../bridge/claude-event-mapper.mjs";
import {
  isLocalCodeBackend,
  localSessionProviderForBackend,
  sessionMatchesBackend,
} from "../app/local-ai-sessions.mjs";

const SESSION_ID = "ee9f42f6-d25f-4c79-8c05-3e5e5d2e11a6";

test("Claude history becomes provider-prefixed resumable sessions", () => {
  const history = [
    JSON.stringify({
      display: "첫 질문",
      timestamp: 1000,
      project: "D:\\projects\\alpha",
      sessionId: SESSION_ID,
    }),
    "broken-json",
    JSON.stringify({
      display: "최근 질문",
      timestamp: 2000,
      project: "D:\\projects\\alpha",
      sessionId: SESSION_ID,
    }),
  ].join("\n");
  const sessions = parseClaudeHistory(history);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].title, "첫 질문");
  assert.equal(sessions[0].preview, "최근 질문");
  assert.equal(toClaudeThreadId(SESSION_ID), `claude:${SESSION_ID}`);
  assert.equal(fromClaudeThreadId(`claude:${SESSION_ID}`), SESSION_ID);
  assert.equal(isClaudeThreadId(`claude:${SESSION_ID}`), true);
});

test("local backend selection keeps Codex and Claude bindings separate", () => {
  assert.equal(isLocalCodeBackend("local-session"), true);
  assert.equal(isLocalCodeBackend("local-claude"), true);
  assert.equal(localSessionProviderForBackend("local-session"), "codex");
  assert.equal(localSessionProviderForBackend("local-claude"), "claude");
  assert.equal(sessionMatchesBackend(SESSION_ID, "local-session"), true);
  assert.equal(
    sessionMatchesBackend(`claude:${SESSION_ID}`, "local-claude"),
    true,
  );
  assert.equal(
    sessionMatchesBackend(`claude:${SESSION_ID}`, "local-session"),
    false,
  );
});

test("Claude stream events map tools, answer text, and completion to cats", () => {
  const context = {
    taskId: "task-1",
    threadId: `claude:${SESSION_ID}`,
    turnId: "turn-1",
    agentId: "coder-toto",
    agentName: "두부",
    seatId: "seat-2",
    department: "coding",
    lastMessage: "",
  };
  const toolEvents = mapClaudeMessage(
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Edit", input: {} }],
      },
    },
    context,
  );
  assert.equal(toolEvents[0].status, "working");
  assert.equal(toolEvents[0].source, "claude");

  mapClaudeMessage(
    {
      type: "assistant",
      message: { content: [{ type: "text", text: "완료 보고" }] },
    },
    context,
  );
  const completed = mapClaudeMessage(
    {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "완료 보고",
      usage: { input_tokens: 10, output_tokens: 4 },
    },
    context,
  );
  assert.deepEqual(
    completed.map((event) => event.type),
    ["task.result", "task.completed"],
  );
  assert.equal(completed[1].result, "완료 보고");
  assert.equal(completed[1].mode, "claude");
});

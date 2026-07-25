import assert from "node:assert/strict";
import test from "node:test";
import { presentThread, presentThreadPage } from "../bridge/session-view.mjs";

test("presents a safe compact session without exposing its raw path", () => {
  const session = presentThread({
    id: "thread_1",
    sessionId: "session_1",
    name: "",
    preview: "첫 번째 작업\n민감한 전체 대화",
    cwd: "D:\\projects\\catAgentGame",
    status: { type: "active", activeFlags: ["waitingOnApproval"] },
    source: "cli",
    modelProvider: "openai",
    updatedAt: 1_753_000_000,
  });

  assert.equal(session.title, "첫 번째 작업");
  assert.equal(session.projectName, "catAgentGame");
  assert.equal(session.status, "active");
  assert.deepEqual(session.activeFlags, ["waitingOnApproval"]);
  assert.equal("cwd" in session, false);
});

test("presents paginated thread results", () => {
  const result = presentThreadPage({
    data: [{ id: "thread_1", preview: "테스트", cwd: "D:\\workspace" }],
    nextCursor: "next_1",
  });
  assert.equal(result.data.length, 1);
  assert.equal(result.nextCursor, "next_1");
});


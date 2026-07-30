import assert from "node:assert/strict";
import test from "node:test";
import {
  createSimulationEvents,
  mapCodexEvent,
} from "../bridge/event-mapper.mjs";

function context() {
  return {
    taskId: "task_test",
    agentId: "coder-toto",
    department: "coding",
    departmentLabel: "Coding",
    prompt: "연동 테스트",
    mode: "codex",
    lastMessage: "",
  };
}

test("maps the Codex JSONL lifecycle into visible office states", () => {
  const ctx = context();

  const thread = mapCodexEvent(
    { type: "thread.started", thread_id: "thread_1" },
    ctx,
  )[0];
  const turn = mapCodexEvent({ type: "turn.started" }, ctx)[0];
  const result = mapCodexEvent(
    {
      type: "item.completed",
      item: { type: "agent_message", text: "연동 확인 완료" },
    },
    ctx,
  )[0];
  const completed = mapCodexEvent(
    {
      type: "turn.completed",
      usage: { input_tokens: 10, output_tokens: 3 },
    },
    ctx,
  )[0];

  assert.equal(thread.location, "general");
  assert.equal(turn.location, "coding");
  assert.equal(turn.status, "moving");
  assert.equal(result.type, "task.result");
  assert.equal(result.location, "queue");
  assert.equal(completed.type, "task.completed");
  assert.equal(completed.location, "queue");
  assert.equal(completed.result, "연동 확인 완료");
});

test("does not expose raw reasoning text to the browser", () => {
  const [event] = mapCodexEvent(
    {
      type: "item.started",
      item: {
        type: "reasoning",
        text: "private chain of thought",
      },
    },
    context(),
  );

  assert.equal(event.type, "agent.status");
  assert.equal(event.status, "working");
  assert.doesNotMatch(JSON.stringify(event), /private chain of thought/);
});

test("maps the live Codex App Server notification shape", () => {
  const ctx = {
    ...context(),
    threadId: "thread_live",
    turnId: "turn_live",
  };
  const [working] = mapCodexEvent(
    {
      method: "item/started",
      params: {
        threadId: "thread_live",
        turnId: "turn_live",
        item: { type: "commandExecution", command: "git status" },
      },
    },
    ctx,
  );
  const [completed] = mapCodexEvent(
    {
      method: "turn/completed",
      params: {
        threadId: "thread_live",
        turn: { id: "turn_live", status: "completed" },
      },
    },
    ctx,
  );

  assert.equal(working.itemType, "commandExecution");
  assert.equal(working.threadId, "thread_live");
  assert.equal(working.turnId, "turn_live");
  assert.equal(completed.type, "task.completed");
});

test("creates a complete no-cost simulation path", () => {
  const events = createSimulationEvents(context());
  assert.deepEqual(
    events.map(({ event }) => event.location),
    ["general", "coding", "coding", "queue", "queue"],
  );
  assert.equal(events.at(-1).event.type, "task.completed");
});

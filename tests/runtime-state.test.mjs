import assert from "node:assert/strict";
import test from "node:test";

import {
  assignSeat,
  enqueueUniqueApproval,
  rekeyRuntime,
  removeApproval,
  resolveRuntimeKey,
} from "../app/runtime-state.mjs";

test("keeps a seat while a pending task key becomes a thread key", () => {
  const initial = {
    "pending:task-1": {
      threadId: "pending:task-1",
      taskId: "task-1",
      seatId: "seat-2",
    },
  };
  const next = rekeyRuntime(initial, "pending:task-1", "thread-1");
  assert.equal(next["thread-1"].seatId, "seat-2");
  assert.equal(next["pending:task-1"], undefined);
});

test("assigns saved free seats first and queues the fifth runtime", () => {
  const occupied = {
    a: { threadId: "a", seatId: "seat-1" },
    b: { threadId: "b", seatId: "seat-2" },
    c: { threadId: "c", seatId: "seat-3" },
    d: { threadId: "d", seatId: "seat-4" },
  };
  assert.equal(assignSeat(occupied, "e", {}), "queue");
  assert.equal(
    assignSeat(
      { a: occupied.a },
      "b",
      { b: "seat-4" },
    ),
    "seat-4",
  );
});

test("routes threadless task events and preserves approval FIFO", () => {
  assert.equal(
    resolveRuntimeKey(
      { taskId: "task-1" },
      new Map([["task-1", "thread-1"]]),
    ),
    "thread-1",
  );

  const first = { requestId: "approval-1" };
  const second = { requestId: "approval-2" };
  let queue = enqueueUniqueApproval([], first);
  queue = enqueueUniqueApproval(queue, second);
  queue = enqueueUniqueApproval(queue, first);
  assert.deepEqual(queue.map((item) => item.requestId), [
    "approval-1",
    "approval-2",
  ]);
  queue = removeApproval(queue, "approval-1");
  assert.deepEqual(queue.map((item) => item.requestId), ["approval-2"]);
});

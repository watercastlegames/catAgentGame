import assert from "node:assert/strict";
import test from "node:test";

import {
  bindSessionToCat,
  migrateRuntimeAssignments,
  parseCatSessionBindings,
  seatForSession,
  unbindSessionFromCat,
} from "../app/cat-session-bindings.mjs";

const THREAD_A = "019f68bb-11c1-7aa1-ba0c-06179d312708";
const THREAD_B = "019f8f11-5655-78b2-9e73-0208dad74f2c";
const THREAD_C = "019fc5f1-f70b-7bc1-ae1c-baa7c67a4f76";
const CLAUDE_THREAD = "claude:ee9f42f6-d25f-4c79-8c05-3e5e5d2e11a6";

test("parses only unique valid cat-to-session bindings", () => {
  assert.deepEqual(
    parseCatSessionBindings(
      JSON.stringify({
        "seat-1": THREAD_A,
        "seat-2": THREAD_A,
        "seat-3": ` ${THREAD_C} `,
        "seat-4": "pending:demo-task",
        "seat-9": THREAD_B,
      }),
    ),
    { "seat-1": THREAD_A, "seat-3": THREAD_C },
  );
});

test("binding a session moves it to exactly one cat", () => {
  const next = bindSessionToCat(
    { "seat-1": THREAD_A, "seat-2": THREAD_B },
    "seat-2",
    THREAD_A,
  );
  assert.deepEqual(next, { "seat-2": THREAD_A });
  assert.equal(seatForSession(next, THREAD_A), "seat-2");
});

test("Claude Code session bindings use a collision-safe provider prefix", () => {
  const parsed = parseCatSessionBindings(
    JSON.stringify({ "seat-1": CLAUDE_THREAD }),
  );
  assert.deepEqual(parsed, { "seat-1": CLAUDE_THREAD });
  assert.equal(
    seatForSession(bindSessionToCat({}, "seat-3", CLAUDE_THREAD), CLAUDE_THREAD),
    "seat-3",
  );
});

test("unbind and legacy assignment migration remain deterministic", () => {
  assert.deepEqual(
    migrateRuntimeAssignments({
      [THREAD_B]: "seat-2",
      [THREAD_A]: "seat-1",
      [THREAD_C]: "seat-1",
      "agent-forest-resident-seat-2": "seat-3",
    }),
    { "seat-2": THREAD_B, "seat-1": THREAD_A },
  );
  assert.deepEqual(
    unbindSessionFromCat({ "seat-1": THREAD_A }, "seat-1"),
    {},
  );
});

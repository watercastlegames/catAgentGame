import assert from "node:assert/strict";
import test from "node:test";

import { isSafeReadOnlyCommand } from "../bridge/security-policy.mjs";

test("auto-approves only exact read-only command approvals", () => {
  assert.equal(
    isSafeReadOnlyCommand(
      "command_execution",
      "git status",
    ),
    true,
  );
  assert.equal(
    isSafeReadOnlyCommand(
      "command_execution",
      "git status && rm -rf /",
    ),
    false,
  );
  assert.equal(
    isSafeReadOnlyCommand("file_write", "git status"),
    false,
  );
  assert.equal(
    isSafeReadOnlyCommand("permissions", "git status"),
    false,
  );
});

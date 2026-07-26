import assert from "node:assert/strict";
import test from "node:test";

import { isSafeReadOnlyCommand } from "../bridge/security-policy.mjs";

test("auto-approves only exact read-only command approvals", () => {
  assert.equal(
    isSafeReadOnlyCommand(
      "item/commandExecution/requestApproval",
      "git status",
    ),
    true,
  );
  assert.equal(
    isSafeReadOnlyCommand(
      "item/commandExecution/requestApproval",
      "git status && rm -rf /",
    ),
    false,
  );
  assert.equal(
    isSafeReadOnlyCommand("item/fileChange/requestApproval", "git status"),
    false,
  );
  assert.equal(
    isSafeReadOnlyCommand("item/permissions/requestApproval", "git status"),
    false,
  );
});

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

test("auto-approves only the known Codex usage footer script", () => {
  const usageCommand =
    '"C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "bun C:\\\\Users\\\\smini\\\\.codex\\\\scripts\\\\cx-usage-footer.ts --cwd \\"C:\\\\Users\\\\smini\\\\AgentForestWorkspace\\" --thread-id \\"$env:CODEX_THREAD_ID\\""';
  assert.equal(
    isSafeReadOnlyCommand("command_execution", usageCommand),
    true,
  );
  assert.equal(
    isSafeReadOnlyCommand(
      "command_execution",
      `${usageCommand}; Remove-Item important.txt`,
    ),
    false,
  );
  assert.equal(
    isSafeReadOnlyCommand(
      "command_execution",
      'powershell.exe -Command "bun C:\\\\Users\\\\smini\\\\other-script.ts --cwd C:\\\\temp --thread-id 1"',
    ),
    false,
  );
});

const DANGER_TOKENS = [
  "&&",
  "||",
  ";",
  "|",
  ">",
  "<",
  "`",
  "$(",
  "sudo",
  "rm",
  "mv",
  "del",
  "curl",
  "wget",
  "chmod",
  "git push",
  "git reset",
  "remove-item",
];

const SAFE_READ_ONLY_COMMANDS = [
  /^git (status|diff|log|show|branch --show-current)$/i,
  /^(ls|dir|pwd)$/i,
  /^(node|npm) -v$/i,
];

function isCodexUsageFooterCommand(command) {
  if (command.length > 700) return false;
  const normalized = command.replaceAll("\\\\", "\\").toLowerCase();
  return (
    normalized.includes("powershell.exe") &&
    normalized.includes(" -command ") &&
    normalized.includes("bun ") &&
    normalized.includes("\\.codex\\scripts\\cx-usage-footer.ts") &&
    normalized.includes(" --cwd ") &&
    normalized.includes(" --thread-id ")
  );
}

export function isSafeReadOnlyCommand(kind, rawCommand) {
  if (kind !== "command_execution") return false;
  const command = String(rawCommand ?? "").trim();
  if (!command) return false;
  const lowered = command.toLowerCase();
  if (DANGER_TOKENS.some((token) => lowered.includes(token))) return false;
  if (isCodexUsageFooterCommand(command)) return true;
  if (command.length > 200) return false;
  return SAFE_READ_ONLY_COMMANDS.some((pattern) => pattern.test(command));
}

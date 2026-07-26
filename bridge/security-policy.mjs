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

export function isSafeReadOnlyCommand(method, rawCommand) {
  if (method !== "item/commandExecution/requestApproval") return false;
  const command = String(rawCommand ?? "").trim();
  if (!command || command.length > 200) return false;
  const lowered = command.toLowerCase();
  if (DANGER_TOKENS.some((token) => lowered.includes(token))) return false;
  return SAFE_READ_ONLY_COMMANDS.some((pattern) => pattern.test(command));
}

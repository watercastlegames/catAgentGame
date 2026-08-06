export const CLAUDE_SESSION_PREFIX = "claude:";

export function isLocalCodeBackend(backendId) {
  return backendId === "local-session" || backendId === "local-claude";
}

export function localSessionProviderForBackend(backendId) {
  if (backendId === "local-claude") return "claude";
  if (backendId === "local-session") return "codex";
  return null;
}

export function isClaudeSessionId(sessionId) {
  return (
    typeof sessionId === "string" && sessionId.startsWith(CLAUDE_SESSION_PREFIX)
  );
}

export function sessionMatchesBackend(sessionId, backendId) {
  if (!sessionId || !isLocalCodeBackend(backendId)) return false;
  return backendId === "local-claude"
    ? isClaudeSessionId(sessionId)
    : !isClaudeSessionId(sessionId);
}

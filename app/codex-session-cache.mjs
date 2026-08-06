export const CODEX_SESSION_CACHE_KEY = "agent-forest-codex-sessions-v1";

const CACHE_VERSION = 1;
const MAX_SESSION_COUNT = 30;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

function normalizeSession(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) return null;

  return {
    id,
    sessionId:
      typeof value.sessionId === "string" && value.sessionId.trim()
        ? value.sessionId.trim()
        : id,
    provider:
      value.provider === "claude" || id.startsWith("claude:")
        ? "claude"
        : "codex",
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : "이름 없는 Codex 세션",
    preview: typeof value.preview === "string" ? value.preview : "",
    projectName:
      typeof value.projectName === "string" && value.projectName.trim()
        ? value.projectName.trim()
        : "Codex",
    status: typeof value.status === "string" ? value.status : "notLoaded",
    activeFlags: Array.isArray(value.activeFlags)
      ? value.activeFlags.filter((flag) => typeof flag === "string").slice(0, 12)
      : [],
    source: typeof value.source === "string" ? value.source : "",
    modelProvider:
      typeof value.modelProvider === "string" ? value.modelProvider : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    ephemeral: value.ephemeral === true,
    canAcceptDirectInput: value.canAcceptDirectInput !== false,
  };
}

export function readCodexSessionCache(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.version !== CACHE_VERSION ||
      !Number.isFinite(parsed.savedAt) ||
      now - parsed.savedAt > MAX_CACHE_AGE_MS ||
      !Array.isArray(parsed.sessions)
    ) {
      return [];
    }
    return parsed.sessions
      .map(normalizeSession)
      .filter(Boolean)
      .slice(0, MAX_SESSION_COUNT);
  } catch {
    return [];
  }
}

export function writeCodexSessionCache(sessions, now = Date.now()) {
  const normalized = Array.isArray(sessions)
    ? sessions
        .map(normalizeSession)
        .filter(Boolean)
        .slice(0, MAX_SESSION_COUNT)
    : [];
  return JSON.stringify({
    version: CACHE_VERSION,
    savedAt: now,
    sessions: normalized,
  });
}

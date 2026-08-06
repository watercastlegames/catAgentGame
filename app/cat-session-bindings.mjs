export const CAT_SESSION_BINDINGS_STORAGE_KEY =
  "agent-forest-cat-session-bindings-v1";

const SEAT_IDS = new Set(["seat-1", "seat-2", "seat-3", "seat-4"]);
const LOCAL_THREAD_ID_PATTERN =
  /^(?:claude:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLocalThreadId(value) {
  return typeof value === "string" && LOCAL_THREAD_ID_PATTERN.test(value.trim());
}

export function parseCatSessionBindings(value) {
  if (!value) return {};
  try {
    const source = typeof value === "string" ? JSON.parse(value) : value;
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const result = {};
    const claimedThreads = new Set();
    for (const [seatId, threadId] of Object.entries(source)) {
      if (!SEAT_IDS.has(seatId) || !isLocalThreadId(threadId)) continue;
      const normalized = threadId.trim();
      if (!normalized || claimedThreads.has(normalized)) continue;
      result[seatId] = normalized;
      claimedThreads.add(normalized);
    }
    return result;
  } catch {
    return {};
  }
}

export function migrateRuntimeAssignments(assignments) {
  if (!assignments || typeof assignments !== "object") return {};
  const result = {};
  for (const [threadId, seatId] of Object.entries(assignments)) {
    if (
      !isLocalThreadId(threadId) ||
      !SEAT_IDS.has(seatId) ||
      result[seatId]
    ) {
      continue;
    }
    result[seatId] = threadId.trim();
  }
  return result;
}

export function bindSessionToCat(bindings, seatId, threadId) {
  if (!SEAT_IDS.has(seatId) || !isLocalThreadId(threadId)) {
    return { ...bindings };
  }
  const normalized = threadId.trim();
  const next = {};
  for (const [candidateSeatId, candidateThreadId] of Object.entries(bindings)) {
    if (candidateSeatId === seatId || candidateThreadId === normalized) continue;
    if (SEAT_IDS.has(candidateSeatId) && isLocalThreadId(candidateThreadId)) {
      next[candidateSeatId] = candidateThreadId;
    }
  }
  next[seatId] = normalized;
  return next;
}

export function unbindSessionFromCat(bindings, seatId) {
  const next = { ...bindings };
  delete next[seatId];
  return next;
}

export function seatForSession(bindings, threadId) {
  if (!threadId) return null;
  return (
    Object.entries(bindings).find(([, candidate]) => candidate === threadId)?.[0] ??
    null
  );
}

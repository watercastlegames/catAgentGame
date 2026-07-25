import path from "node:path";

export function safeText(value, maxLength = 700) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function toIsoTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    return new Date(milliseconds).toISOString();
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

function sourceLabel(source) {
  if (typeof source === "string") return source;
  if (source && typeof source === "object") {
    return (
      source.type ??
      source.kind ??
      Object.keys(source).find((key) => source[key] != null) ??
      "unknown"
    );
  }
  return "unknown";
}

export function presentThread(thread) {
  const preview = safeText(thread?.preview, 240);
  const projectName =
    typeof thread?.cwd === "string" && thread.cwd
      ? path.basename(thread.cwd)
      : "알 수 없는 프로젝트";
  const title =
    safeText(thread?.name, 100) ||
    safeText(preview.split(/\r?\n/)[0], 100) ||
    projectName;
  const status =
    typeof thread?.status === "string"
      ? thread.status
      : safeText(thread?.status?.type, 32) || "notLoaded";

  return {
    id: safeText(thread?.id, 160),
    sessionId: safeText(thread?.sessionId, 160),
    title,
    preview,
    projectName,
    status,
    activeFlags: Array.isArray(thread?.status?.activeFlags)
      ? thread.status.activeFlags.map((flag) => safeText(flag, 60)).filter(Boolean)
      : [],
    source: sourceLabel(thread?.source ?? thread?.threadSource),
    modelProvider: safeText(thread?.modelProvider, 80),
    updatedAt: toIsoTime(thread?.recencyAt ?? thread?.updatedAt),
    createdAt: toIsoTime(thread?.createdAt),
    ephemeral: Boolean(thread?.ephemeral),
    canAcceptDirectInput: Boolean(thread?.canAcceptDirectInput),
  };
}

export function presentThreadPage(result) {
  return {
    data: Array.isArray(result?.data) ? result.data.map(presentThread) : [],
    nextCursor:
      typeof result?.nextCursor === "string" ? result.nextCursor : null,
  };
}


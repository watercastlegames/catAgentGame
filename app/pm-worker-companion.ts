"use client";

export const PM_WORKER_CHAT_SHELL_COST = 5;
const PM_WORKER_SESSION_KEY = "agent-forest-pm-worker-sessions-v1";

export type PmWorkerConnectionState = "loading" | "ready" | "error";

type PmWorkerChatResponse = {
  reply?: string;
  sessionId?: string;
  error?: string;
};

function readSessionMap() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(PM_WORKER_SESSION_KEY) ?? "{}",
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && /^s\d{6}-\d{6}$/.test(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function readPmWorkerSession(catId: string) {
  return readSessionMap()[catId] ?? null;
}

function savePmWorkerSession(catId: string, sessionId: string) {
  const sessions = readSessionMap();
  sessions[catId] = sessionId;
  window.localStorage.setItem(PM_WORKER_SESSION_KEY, JSON.stringify(sessions));
}

export async function inspectPmWorkerConnection(): Promise<PmWorkerConnectionState> {
  try {
    const response = await fetch("/api/pm-worker/health", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return response.ok ? "ready" : "error";
  } catch {
    return "error";
  }
}

export async function submitPmWorkerTask(prompt: string, catId: string) {
  const sessionId = readPmWorkerSession(catId);
  const response = await fetch("/api/pm-worker/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ prompt, sessionId }),
  });
  const body = (await response.json()) as PmWorkerChatResponse;
  if (!response.ok || !body.reply || !body.sessionId) {
    throw new Error(body.error ?? "PM Worker AI 응답을 받지 못했어요.");
  }
  savePmWorkerSession(catId, body.sessionId);
  return {
    reply: body.reply.trim(),
    sessionId: body.sessionId,
  };
}

"use client";

import { normalizePmWorkerReply } from "./pm-worker-reply.mjs";
import { AI_CHAT_SHELL_COST } from "./ai-chat-economy.mjs";

export const PM_WORKER_CHAT_SHELL_COST = AI_CHAT_SHELL_COST;
const PM_WORKER_SESSION_KEY = "agent-forest-pm-worker-sessions-v1";

export type PmWorkerConnectionState =
  | "loading"
  | "ready"
  /** 이 판에는 AI 엔드포인트 자체가 없다(정적 미리보기 복사본). */
  | "unavailable"
  | "error";

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

export function clearPmWorkerSession(catId: string) {
  const sessions = readSessionMap();
  if (!(catId in sessions)) return;
  delete sessions[catId];
  if (Object.keys(sessions).length > 0) {
    window.localStorage.setItem(PM_WORKER_SESSION_KEY, JSON.stringify(sessions));
  } else {
    window.localStorage.removeItem(PM_WORKER_SESSION_KEY);
  }
}

export async function inspectPmWorkerConnection(): Promise<PmWorkerConnectionState> {
  try {
    const response = await fetch("/api/pm-worker/health", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (response.ok) return "ready";
    /* 404 는 "서버가 잠깐 이상함"이 아니라 "이 판에는 AI 가 아예 없음"이다.
       정적 미리보기 복사본이 그렇다 — 둘을 같은 문구로 묶으면
       고칠 수 없는 것을 계속 다시 시도하게 된다. */
    return response.status === 404 ? "unavailable" : "error";
  } catch {
    return "error";
  }
}

export async function submitPmWorkerTask(
  prompt: string,
  catId: string,
  webQuery = prompt,
) {
  const sessionId = readPmWorkerSession(catId);
  const response = await fetch("/api/pm-worker/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ prompt, sessionId, webQuery }),
  });
  const body = (await response.json()) as PmWorkerChatResponse;
  if (!response.ok || !body.reply || !body.sessionId) {
    throw new Error(body.error ?? "PM Worker AI 응답을 받지 못했어요.");
  }
  savePmWorkerSession(catId, body.sessionId);
  return {
    reply: normalizePmWorkerReply(body.reply),
    sessionId: body.sessionId,
  };
}

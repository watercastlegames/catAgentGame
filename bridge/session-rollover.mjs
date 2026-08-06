import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const LARGE_THREAD_ROLLOUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TAIL_BYTES = 12 * 1024 * 1024;

async function findInDirectory(directory, expectedSuffix, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(expectedSuffix)) {
      return path.join(directory, entry.name);
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findInDirectory(
      path.join(directory, entry.name),
      expectedSuffix,
      depth - 1,
    );
    if (found) return found;
  }
  return null;
}

export async function inspectThreadRollout(sessionsRoot, threadId) {
  if (!/^[0-9a-f-]{16,}$/i.test(String(threadId ?? ""))) return null;
  const filePath = await findInDirectory(
    sessionsRoot,
    `${threadId}.jsonl`,
    4,
  );
  if (!filePath) return null;
  const info = await stat(filePath);
  return {
    filePath,
    size: info.size,
    oversized: info.size >= LARGE_THREAD_ROLLOUT_BYTES,
  };
}

function messageText(payload) {
  if (typeof payload?.content === "string") return payload.content;
  if (!Array.isArray(payload?.content)) return "";
  return payload.content
    .map((part) =>
      typeof part === "string"
        ? part
        : typeof part?.text === "string"
          ? part.text
          : typeof part?.input_text === "string"
            ? part.input_text
            : typeof part?.output_text === "string"
              ? part.output_text
              : "",
    )
    .join("\n")
    .trim();
}

export async function readRecentConversation(
  filePath,
  { tailBytes = DEFAULT_TAIL_BYTES, maxMessages = 8, maxMessageChars = 1_200 } = {},
) {
  const handle = await open(filePath, "r");
  try {
    const info = await handle.stat();
    const size = Math.min(info.size, tailBytes);
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, info.size - size);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (info.size > size) lines.shift();
    const messages = [];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (messages.length >= maxMessages) break;
      let entry;
      try {
        entry = JSON.parse(lines[index]);
      } catch {
        continue;
      }
      const payload = entry?.payload;
      if (entry?.type !== "response_item" || payload?.type !== "message") {
        continue;
      }
      if (payload.role !== "user" && payload.role !== "assistant") continue;
      const text = messageText(payload).slice(0, maxMessageChars).trim();
      if (!text) continue;
      messages.push({ role: payload.role, text });
    }
    return messages.reverse();
  } finally {
    await handle.close();
  }
}

export function buildRolloverPrompt({ originalTitle, recentMessages, prompt }) {
  const history = recentMessages.length
    ? recentMessages
        .map(
          (message) =>
            `${message.role === "user" ? "사용자" : "Codex"}: ${message.text}`,
        )
        .join("\n\n")
    : "최근 대화 요약을 읽지 못했습니다.";
  return [
    "[Agent Forest 대형 세션 자동 승계]",
    `원본 세션: ${String(originalTitle || "이름 없는 Codex 세션").slice(0, 160)}`,
    "원본 세션이 매우 커 직접 재개하지 않고, 아래 최근 대화를 바탕으로 새 세션에서 자연스럽게 이어갑니다.",
    "",
    history,
    "",
    "[이번 사용자 요청]",
    prompt,
  ].join("\n");
}

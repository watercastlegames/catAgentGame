import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildRolloverPrompt,
  inspectThreadRollout,
  readRecentConversation,
} from "../bridge/session-rollover.mjs";

test("rollover inspection finds a nested Codex rollout by thread id", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-forest-rollover-"));
  const folder = path.join(root, "2026", "08", "04");
  await mkdir(folder, { recursive: true });
  const threadId = "019f8f11-5655-78b2-9e73-0208dad74f2c";
  const filePath = path.join(folder, `rollout-test-${threadId}.jsonl`);
  await writeFile(filePath, "{}\n", "utf8");

  const inspected = await inspectThreadRollout(root, threadId);
  assert.equal(inspected?.filePath, filePath);
  assert.equal(inspected?.oversized, false);
});

test("rollover context keeps only recent user and assistant messages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-forest-rollover-"));
  const filePath = path.join(root, "rollout.jsonl");
  const line = (role, text) =>
    JSON.stringify({
      type: "response_item",
      payload: { type: "message", role, content: [{ type: "text", text }] },
    });
  await writeFile(
    filePath,
    [
      line("developer", "skip"),
      line("user", "이전 질문"),
      line("assistant", "이전 답변"),
      line("user", "최근 질문"),
    ].join("\n") + "\n",
    "utf8",
  );

  const messages = await readRecentConversation(filePath, { maxMessages: 2 });
  assert.deepEqual(messages, [
    { role: "assistant", text: "이전 답변" },
    { role: "user", text: "최근 질문" },
  ]);
  const prompt = buildRolloverPrompt({
    originalTitle: "고양이 개발",
    recentMessages: messages,
    prompt: "계속 진행해줘",
  });
  assert.match(prompt, /대형 세션 자동 승계/);
  assert.match(prompt, /고양이 개발/);
  assert.match(prompt, /최근 질문/);
  assert.match(prompt, /계속 진행해줘/);
});

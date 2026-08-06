import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AI_CHAT_SHELL_COST,
  chargeAiChat,
  isAiChatShellBackend,
  refundAiChat,
} from "../app/ai-chat-economy.mjs";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("all four playable AI chats cost exactly five shells", () => {
  assert.equal(AI_CHAT_SHELL_COST, 5);
  assert.equal(isAiChatShellBackend("local-session"), true);
  assert.equal(isAiChatShellBackend("local-claude"), true);
  assert.equal(isAiChatShellBackend("puter"), true);
  assert.equal(isAiChatShellBackend("pm-worker"), true);
  assert.deepEqual(chargeAiChat(12), { ok: true, balance: 7, cost: 5 });
  assert.deepEqual(chargeAiChat(4), { ok: false, balance: 4, cost: 5 });
  assert.equal(refundAiChat(7), 12);
});

test("local Codex, local Claude, Puter, and PM Worker wire charge and refunds", () => {
  for (const backend of [
    "local-session",
    "local-claude",
    "puter",
    "pm-worker",
  ]) {
    assert.match(page, new RegExp(`chargeChatShells\\("${backend}-chat"\\)`));
    assert.match(page, new RegExp(`refundChatShells\\("${backend}-chat-refund"\\)`));
  }
  assert.match(page, /shells < AI_CHAT_SHELL_COST/);
});

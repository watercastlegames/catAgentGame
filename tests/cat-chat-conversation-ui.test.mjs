import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [page, content, css, pmClient] = await Promise.all([
  readFile(new URL("app/page.tsx", root), "utf8"),
  readFile(new URL("app/chat-message-content.tsx", root), "utf8"),
  readFile(new URL("app/globals.css", root), "utf8"),
  readFile(new URL("app/pm-worker-companion.ts", root), "utf8"),
]);

test("cat chat reopens and follows the latest message", () => {
  assert.match(page, /catChatThreadRef/);
  assert.match(page, /thread\.scrollTo\(\{/);
  assert.match(page, /top: thread\.scrollHeight/);
  assert.match(page, /catChatScrollInstantRef\.current = true/);
});

test("cat chat can clear the visible history and reset its PM Worker session", () => {
  assert.match(page, /function clearFocusedCatConversation/);
  assert.match(page, /clearPmWorkerSession\(focusedResidentCatId\)/);
  assert.match(page, /대화 지우기/);
  assert.match(pmClient, /export function clearPmWorkerSession/);
});

test("chat answers render safe clickable HTTP links", () => {
  assert.match(content, /https\?:\\\/\\\//);
  assert.match(content, /target="_blank"/);
  assert.match(content, /rel="noopener noreferrer"/);
  assert.match(page, /ChatMessageContent content=/);
  assert.match(css, /\.cat-chat-message a/);
});

test("visible cat history is included as fallback memory for the next request", () => {
  assert.match(page, /function conversationMemoryFromEvents/);
  assert.match(page, /conversationHistory: conversationMemoryFromEvents\(focusedConversation\)/);
  assert.match(page, /최근 대화와 이어서 어때요/);
  assert.match(page, /방금 이야기와 관심사를 바탕으로 골랐어요/);
});

test("a cat can switch its assigned local AI session from the care conversation", () => {
  assert.match(page, /function chooseCatCompanionBackend/);
  assert.match(page, /setCatSessionPickerOpen\(true\)/);
  assert.match(page, /className="cat-session-quick-switch"/);
  assert.match(
    page,
    /aria-label={`\$\{focusedCatName\}의 \$\{selectedLocalProviderLabel\} 세션 선택`}/,
  );
  assert.match(page, /assignSessionToCat\(focusedSeatId, threadId\)/);
  assert.match(page, /다른 고양이 담당/);
  assert.match(css, /\.cat-session-quick-switch select/);
});

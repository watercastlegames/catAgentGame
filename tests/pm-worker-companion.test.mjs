import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(
  new URL("../app/pm-worker-companion.ts", import.meta.url),
  "utf8",
);
const relay = await readFile(
  new URL("../worker/pm-worker-relay.ts", import.meta.url),
  "utf8",
);
const page = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);
const bridge = await readFile(
  new URL("../bridge/server.mjs", import.meta.url),
  "utf8",
);
const cloudRelay = await readFile(
  new URL("../worker/relay.ts", import.meta.url),
  "utf8",
);

test("PM Worker chat charges exactly five shells per submitted conversation", () => {
  assert.match(client, /PM_WORKER_CHAT_SHELL_COST\s*=\s*AI_CHAT_SHELL_COST/);
  assert.match(page, /pm-worker-chat/);
  assert.match(page, /chargeChatShells\("pm-worker-chat"\)/);
});

test("PM Worker secret stays in the server relay environment", () => {
  assert.match(relay, /PM_WORKER_CHAT_API_KEY/);
  assert.doesNotMatch(client, /X-HiKami-Key/);
  assert.doesNotMatch(client, /hk_2026/);
});

test("PM Worker relay supports health and chat without exposing the upstream key", () => {
  assert.match(relay, /\/api\/pm-worker\/health/);
  assert.match(relay, /\/api\/pm-worker\/chat/);
  assert.match(relay, /project-manager-worker/);
});

test("sidak static copy calls the Sites PM Worker relay with restricted CORS", () => {
  assert.match(client, /PM_WORKER_SERVICE_ORIGIN/);
  assert.match(client, /window\.location\.hostname === "sidak\.kr"/);
  assert.match(client, /pmWorkerApiUrl\("\/api\/pm-worker\/health"\)/);
  assert.match(client, /pmWorkerApiUrl\("\/api\/pm-worker\/chat"\)/);
  assert.match(relay, /ALLOWED_BROWSER_ORIGINS/);
  assert.match(relay, /"https:\/\/sidak\.kr"/);
  assert.match(relay, /Access-Control-Allow-Origin/);
  assert.match(relay, /request\.method === "OPTIONS"/);
});

test("PM Worker health verifies a real chat instead of a history-only false positive", () => {
  assert.match(relay, /target\.searchParams\.set\("action", "chat"\)/);
  assert.match(relay, /healthPrompt/);
  assert.match(relay, /HEALTH_CACHE_MS/);
  assert.match(relay, /!upstream\.ok \|\| !body\?\.reply/);
  assert.doesNotMatch(relay, /target\.searchParams\.set\("action", "history"\)/);
  assert.match(client, /body\?\.ready === true/);
  assert.match(client, /body\?\.code === "worker_down"/);
  assert.match(page, /Claude Code \(내 PC\)로 전환/);
  assert.match(page, /ChatGPT Codex \(내 PC\)로 전환/);
});

test("PM Worker automatically falls back to the paired local Claude Code", () => {
  assert.match(page, /pmWorkerLocalFallbackReady/);
  assert.match(page, /apiFetch\("\/v2\/pm-worker\/chat"/);
  assert.match(page, /PM Worker를 내 PC Claude Code로 자동 복구했어요/);
  assert.match(bridge, /async function startPmWorkerFallback/);
  assert.match(bridge, /pmWorkerFallbackSessions/);
  assert.match(bridge, /conversationThreadId/);
  assert.match(cloudRelay, /relayPath === "\/v2\/pm-worker\/chat"/);
});

test("PM Worker relay explicitly requests web search for current-information prompts", () => {
  assert.match(relay, /export function needsCurrentWeb/);
  assert.match(relay, /CURRENT_WEB_TERMS/);
  assert.match(relay, /needsCurrentWeb\(webQuery\)/);
  assert.match(relay, /form\.set\("web_search", "1"\)/);
  assert.match(relay, /"최신"/);
  assert.match(relay, /"최근"/);
  assert.match(relay, /"급등"/);
  assert.match(client, /webQuery/);
});

test("PM Worker rejects stale current-information replies without source links", () => {
  assert.match(relay, /currentWebReplyHasSources/);
  assert.match(relay, /2025년/);
  assert.match(relay, /current_web_unverified/);
});

test("PM Worker accepts a compact local conversation fallback", () => {
  assert.match(relay, /prompt\.length > 8_000/);
  assert.match(relay, /AI 문맥을 포함한 대화 내용/);
});

test("PM Worker relay transports Korean prompts without Classic ASP form corruption", () => {
  assert.match(relay, /function utf8Base64/);
  assert.match(relay, /message_b64:\s*utf8Base64\(prompt\)/);
});

test("PM Worker relay recovers the current-web service and retries once", () => {
  assert.match(relay, /bootstrapCurrentWebRelay/);
  assert.match(relay, /relay-bootstrap\.asp/);
  assert.match(relay, /body\?\.code === 503/);
  assert.match(relay, /if \(restarted\)/);
});

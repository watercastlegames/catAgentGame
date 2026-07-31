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

test("PM Worker chat charges exactly five shells per submitted conversation", () => {
  assert.match(client, /PM_WORKER_CHAT_SHELL_COST\s*=\s*5/);
  assert.match(page, /pm-worker-chat/);
  assert.match(page, /recordShellDelta\(\s*-PM_WORKER_CHAT_SHELL_COST/);
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

test("PM Worker relay explicitly requests web search for current-information prompts", () => {
  assert.match(relay, /export function needsCurrentWeb/);
  assert.match(relay, /CURRENT_WEB_TERMS/);
  assert.match(relay, /needsCurrentWeb\(prompt\)/);
  assert.match(relay, /form\.set\("web_search", "1"\)/);
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

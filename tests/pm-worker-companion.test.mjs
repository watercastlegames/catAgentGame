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

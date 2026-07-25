import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { CodexAppServerClient } from "../bridge/codex-app-server-client.mjs";

function createFakeProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin.setEncoding("utf8");
  child.stdin.on("data", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      child.stdout.write(
        `${JSON.stringify({ id: message.id, result: { userAgent: "fake" } })}\n`,
      );
    }
    if (message.method === "thread/list") {
      child.stdout.write(
        `${JSON.stringify({
          id: message.id,
          result: { data: [{ id: "thread_1" }], nextCursor: null },
        })}\n`,
      );
    }
  });
  return child;
}

test("initializes the Codex App Server and exchanges newline JSON-RPC", async () => {
  const child = createFakeProcess();
  const client = new CodexAppServerClient({
    codexEntry: "codex.js",
    cwd: process.cwd(),
    spawnProcess: () => child,
  });

  await client.start();
  assert.equal(client.ready, true);
  const result = await client.request("thread/list", { limit: 1 });
  assert.deepEqual(result, {
    data: [{ id: "thread_1" }],
    nextCursor: null,
  });
});

test("surfaces notifications and approval requests without exposing internals", async () => {
  const child = createFakeProcess();
  const client = new CodexAppServerClient({
    codexEntry: "codex.js",
    cwd: process.cwd(),
    spawnProcess: () => child,
  });
  await client.start();

  const notificationPromise = once(client, "notification");
  child.stdout.write(
    `${JSON.stringify({
      method: "turn/started",
      params: { threadId: "thread_1", turn: { id: "turn_1" } },
    })}\n`,
  );
  const [notification] = await notificationPromise;
  assert.equal(notification.method, "turn/started");

  const requestPromise = once(client, "request");
  child.stdout.write(
    `${JSON.stringify({
      id: 42,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread_1", turnId: "turn_1" },
    })}\n`,
  );
  const [request] = await requestPromise;
  assert.equal(request.id, 42);
  assert.equal(request.method, "item/commandExecution/requestApproval");
});


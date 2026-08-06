import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

import { CloudRelay, waitForRelayCycle } from "../bridge/cloud-relay.mjs";

test("relay cycle waits remove abort listeners after their timer completes", async () => {
  const controller = new AbortController();

  for (let index = 0; index < 25; index += 1) {
    await waitForRelayCycle(0, controller.signal);
  }

  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("relay cycle wait resolves and removes its listener when aborted", async () => {
  const controller = new AbortController();
  const waiting = waitForRelayCycle(60_000, controller.signal);

  assert.equal(getEventListeners(controller.signal, "abort").length, 1);
  controller.abort();
  await waiting;

  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("relay requests do not retain listeners on the lifetime abort signal", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.signal.aborted, false);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const relay = new CloudRelay({
    baseUrl: "https://relay.invalid",
    deviceId: "device-1234567890",
    secret: "secret-123456789012345678901234567890",
    pairingCode: "123456",
    getSnapshot: async () => ({}),
    executeCommand: async () => ({}),
  });
  relay.abortController = new AbortController();

  try {
    for (let index = 0; index < 30; index += 1) {
      await relay.request("/health");
    }
    assert.equal(
      getEventListeners(relay.abortController.signal, "abort").length,
      0,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

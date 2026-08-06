import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const DEFAULT_RELAY_URL =
  "https://agent-forest-raccoon.sminia82.chatgpt.site";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export function waitForRelayCycle(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let timer;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });

    // Cover the narrow race where the signal aborts between the first check
    // and registering the listener.
    if (signal?.aborted) finish();
  });
}

export function loadOrCreateRelayIdentity(filePath) {
  if (existsSync(filePath)) {
    try {
      const saved = JSON.parse(readFileSync(filePath, "utf8"));
      if (
        typeof saved.deviceId === "string" &&
        typeof saved.secret === "string" &&
        saved.deviceId.length >= 16 &&
        saved.secret.length >= 32
      ) {
        return saved;
      }
    } catch {
      // Replace invalid local identity with a fresh one.
    }
  }
  const identity = {
    deviceId: randomUUID().replaceAll("-", ""),
    secret: randomBytes(32).toString("hex"),
  };
  writeFileSync(filePath, `${JSON.stringify(identity, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return identity;
}

export class CloudRelay {
  constructor({
    baseUrl = DEFAULT_RELAY_URL,
    deviceId,
    secret,
    pairingCode,
    getSnapshot,
    executeCommand,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.deviceId = deviceId;
    this.secret = secret;
    this.pairingCode = pairingCode;
    this.getSnapshot = getSnapshot;
    this.executeCommand = executeCommand;
    this.requestTimeoutMs = requestTimeoutMs;
    this.abortController = null;
    this.events = [];
    this.online = false;
    this.lastError = null;
    this.lastSnapshotAt = 0;
    this.lastRegisterAt = 0;
    this.loopPromise = null;
  }

  headers() {
    return {
      Authorization: `Bearer ${this.secret}`,
      "Content-Type": "application/json",
      "X-Agent-Forest-Device": this.deviceId,
    };
  }

  async request(pathname, init = {}) {
    // A single long-lived AbortSignal must not be passed to every fetch call.
    // Undici retains listeners while a request/body is alive; reusing the relay
    // lifetime signal caused listeners and response state to accumulate until
    // the local bridge stopped answering even /health.
    const requestController = new AbortController();
    const relaySignal = this.abortController?.signal;
    const abortRequest = () => requestController.abort(relaySignal?.reason);
    const timeout = setTimeout(
      () => requestController.abort(new Error("클라우드 중계 요청 시간 초과")),
      this.requestTimeoutMs,
    );
    timeout.unref?.();
    relaySignal?.addEventListener("abort", abortRequest, { once: true });
    if (relaySignal?.aborted) abortRequest();

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers ?? {}) },
        signal: requestController.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? `클라우드 중계 오류 (${response.status})`);
      }
      return body;
    } finally {
      clearTimeout(timeout);
      relaySignal?.removeEventListener("abort", abortRequest);
    }
  }

  publishEvent(event) {
    if (!event || typeof event !== "object") return;
    this.events.push(event);
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }

  status() {
    return {
      enabled: true,
      online: this.online,
      relayUrl: this.baseUrl,
      lastError: this.lastError,
    };
  }

  async register(snapshot) {
    await this.request("/api/relay/device/register", {
      method: "POST",
      body: JSON.stringify({
        deviceId: this.deviceId,
        pairingCode: this.pairingCode,
        pairingExpiresAt: Date.now() + 10 * 60_000,
        snapshot,
      }),
    });
    this.lastRegisterAt = Date.now();
  }

  async updateSnapshot(snapshot) {
    await this.request("/api/relay/device/snapshot", {
      method: "POST",
      body: JSON.stringify({ snapshot }),
    });
    this.lastSnapshotAt = Date.now();
  }

  async flushEvents() {
    if (!this.events.length) return;
    const batch = this.events.splice(0, 50);
    try {
      await this.request("/api/relay/device/events", {
        method: "POST",
        body: JSON.stringify({ events: batch }),
      });
    } catch (error) {
      this.events.unshift(...batch);
      throw error;
    }
  }

  async pollCommands() {
    const body = await this.request("/api/relay/device/commands");
    let executed = false;
    for (const command of body.commands ?? []) {
      try {
        const result = await this.executeCommand(command);
        executed = true;
        await this.request(
          `/api/relay/device/commands/${encodeURIComponent(command.id)}/complete`,
          {
            method: "POST",
            body: JSON.stringify({ ok: true, result }),
          },
        );
      } catch (error) {
        await this.request(
          `/api/relay/device/commands/${encodeURIComponent(command.id)}/complete`,
          {
            method: "POST",
            body: JSON.stringify({
              ok: false,
              error:
                error instanceof Error ? error.message : "명령 실행에 실패했습니다.",
            }),
          },
        );
      }
    }
    if (executed) {
      await this.updateSnapshot(await this.getSnapshot());
    }
  }

  async cycle() {
    const now = Date.now();
    const needsSnapshot = now - this.lastSnapshotAt >= 8_000;
    const needsRegister = now - this.lastRegisterAt >= 30_000;
    let snapshot = null;
    if (needsSnapshot || needsRegister) snapshot = await this.getSnapshot();
    if (needsRegister) {
      await this.register(snapshot);
      this.lastSnapshotAt = now;
    } else if (needsSnapshot) {
      await this.updateSnapshot(snapshot);
    }
    await this.flushEvents();
    await this.pollCommands();
  }

  start() {
    if (this.loopPromise) return this.loopPromise;
    this.abortController = new AbortController();
    this.loopPromise = (async () => {
      while (!this.abortController.signal.aborted) {
        try {
          await this.cycle();
          this.online = true;
          this.lastError = null;
          await waitForRelayCycle(1_250, this.abortController.signal);
        } catch (error) {
          if (this.abortController.signal.aborted) break;
          this.online = false;
          this.lastError =
            error instanceof Error ? error.message : "클라우드 중계 연결 실패";
          await waitForRelayCycle(4_000, this.abortController.signal);
        }
      }
    })().finally(() => {
      this.online = false;
      this.loopPromise = null;
    });
    return this.loopPromise;
  }

  async stop() {
    this.abortController?.abort();
    await this.loopPromise;
  }
}

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function rpcError(error) {
  const message =
    typeof error?.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "Codex App Server 요청에 실패했습니다.";
  const result = new Error(message);
  result.code = error?.code;
  result.data = error?.data;
  return result;
}

export class CodexAppServerClient extends EventEmitter {
  constructor({
    codexEntry,
    cwd,
    nodePath = process.execPath,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    spawnProcess = spawn,
  }) {
    super();
    this.codexEntry = codexEntry;
    this.cwd = cwd;
    this.nodePath = nodePath;
    this.requestTimeoutMs = requestTimeoutMs;
    this.spawnProcess = spawnProcess;
    this.child = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextRequestId = 1;
    this.ready = false;
    this.starting = null;
    this.stderrTail = "";
  }

  async start() {
    if (this.ready) return this;
    if (this.starting) return this.starting;
    if (!this.codexEntry) {
      throw new Error("Codex CLI 실행 파일을 찾지 못했습니다.");
    }

    this.starting = this.#startProcess();
    try {
      await this.starting;
      return this;
    } finally {
      this.starting = null;
    }
  }

  async #startProcess() {
    const child = this.spawnProcess(
      this.nodePath,
      [this.codexEntry, "app-server", "--listen", "stdio://"],
      {
        cwd: this.cwd,
        env: { ...process.env, NO_COLOR: "1" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    this.child = child;
    this.buffer = "";
    this.stderrTail = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => this.#consume(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4_000);
    });
    child.on("error", (error) => this.#handleClose(error));
    child.on("close", (code) => {
      const detail = this.stderrTail
        .split(/\r?\n/)
        .find((line) => line.trim());
      this.#handleClose(
        new Error(
          detail?.trim() ||
            `Codex App Server가 종료되었습니다. (종료 코드 ${code ?? "unknown"})`,
        ),
      );
    });

    await this.request("initialize", {
      clientInfo: {
        name: "agent-forest-companion",
        title: "Agent Forest PC Companion",
        version: "0.2.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.notify("initialized");
    this.ready = true;
    this.emit("ready");
  }

  async request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.child?.stdin?.writable) {
      throw new Error("Codex App Server가 연결되어 있지 않습니다.");
    }

    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 요청 시간이 초과되었습니다.`));
      }, timeoutMs);
      timer.unref?.();

      this.pending.set(id, { resolve, reject, timer, method });
      this.#write({ id, method, params });
    });
  }

  notify(method, params) {
    const payload = { method };
    if (params !== undefined) payload.params = params;
    this.#write(payload);
  }

  respond(id, result) {
    this.#write({ id, result });
  }

  respondError(id, code, message) {
    this.#write({ id, error: { code, message } });
  }

  async stop() {
    const child = this.child;
    this.child = null;
    this.ready = false;
    if (!child || child.killed) return;
    child.kill();
  }

  #write(payload) {
    if (!this.child?.stdin?.writable) {
      throw new Error("Codex App Server에 메시지를 보낼 수 없습니다.");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  #consume(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.#handleMessage(JSON.parse(line));
      } catch (error) {
        this.emit("protocolError", error);
      }
    }
  }

  #handleMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.id !== undefined && message.method) {
      this.emit("request", {
        id: message.id,
        method: message.method,
        params: message.params ?? {},
      });
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(rpcError(message.error));
      else pending.resolve(message.result);
      return;
    }

    if (message.method) {
      this.emit("notification", {
        method: message.method,
        params: message.params ?? {},
      });
    }
  }

  #handleClose(error) {
    if (!this.child && !this.ready && this.pending.size === 0) return;
    this.child = null;
    this.ready = false;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit("close", error);
  }
}


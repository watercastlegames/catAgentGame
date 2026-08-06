import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { open as openFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

export const CLAUDE_SESSION_PREFIX = "claude:";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_TAIL_BYTES = 8 * 1024 * 1024;
const ALLOWED_PERMISSION_MODES = new Set([
  "acceptEdits",
  "auto",
  "dontAsk",
  "manual",
  "plan",
]);

function cleanText(value, maxLength = 600) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function toIsoTime(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1_000 : numeric;
    return new Date(milliseconds).toISOString();
  }
  const parsed = new Date(value ?? 0);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

function projectLabel(cwd) {
  return cleanText(path.basename(cwd || ""), 100) || "Claude 프로젝트";
}

export function toClaudeThreadId(sessionId) {
  const normalized = cleanText(sessionId, 80);
  if (!UUID_PATTERN.test(normalized)) return "";
  return `${CLAUDE_SESSION_PREFIX}${normalized}`;
}

export function fromClaudeThreadId(threadId) {
  if (typeof threadId !== "string" || !threadId.startsWith(CLAUDE_SESSION_PREFIX)) {
    return "";
  }
  const sessionId = threadId.slice(CLAUDE_SESSION_PREFIX.length);
  return UUID_PATTERN.test(sessionId) ? sessionId : "";
}

export function isClaudeThreadId(threadId) {
  return Boolean(fromClaudeThreadId(threadId));
}

async function readTail(filePath, maxBytes = HISTORY_TAIL_BYTES) {
  let handle;
  try {
    const info = await stat(filePath);
    const length = Math.min(info.size, maxBytes);
    const start = Math.max(0, info.size - length);
    handle = await openFile(filePath, "r");
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const firstNewline = text.indexOf("\n");
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
    }
    return text;
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

export function parseClaudeHistory(text) {
  const sessions = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const sessionId = cleanText(entry?.sessionId, 80);
    if (!UUID_PATTERN.test(sessionId)) continue;
    const cwd = cleanText(entry?.project, 520);
    const display = cleanText(entry?.display, 1_200);
    const timestamp = Number(entry?.timestamp) || 0;
    const current = sessions.get(sessionId);
    if (!current) {
      sessions.set(sessionId, {
        sessionId,
        cwd,
        title: cleanText(display.split(/\r?\n/)[0], 100),
        preview: display,
        createdAtMs: timestamp,
        updatedAtMs: timestamp,
      });
      continue;
    }
    if (!current.cwd && cwd) current.cwd = cwd;
    if (!current.title && display) {
      current.title = cleanText(display.split(/\r?\n/)[0], 100);
    }
    if (timestamp >= current.updatedAtMs) {
      current.preview = display || current.preview;
      current.updatedAtMs = timestamp;
    }
    if (timestamp && (!current.createdAtMs || timestamp < current.createdAtMs)) {
      current.createdAtMs = timestamp;
    }
  }
  return [...sessions.values()];
}

function presentSession(session, active = false) {
  const id = toClaudeThreadId(session.sessionId);
  const cwd = cleanText(session.cwd, 520);
  const title =
    cleanText(session.title, 100) ||
    cleanText(session.preview?.split(/\r?\n/)[0], 100) ||
    projectLabel(cwd);
  return {
    id,
    sessionId: session.sessionId,
    provider: "claude",
    title,
    preview: cleanText(session.preview, 240),
    projectName: projectLabel(cwd),
    cwd,
    status: active ? "active" : "idle",
    activeFlags: active ? ["running"] : [],
    source: "claude-code",
    modelProvider: "anthropic",
    updatedAt: toIsoTime(session.updatedAtMs),
    createdAt: toIsoTime(session.createdAtMs || session.updatedAtMs),
    ephemeral: false,
    canAcceptDirectInput: !active,
  };
}

async function findClaudeSessionFile(projectsRoot, sessionId) {
  let projectDirectories = [];
  try {
    projectDirectories = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  for (const entry of projectDirectories) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(projectsRoot, entry.name, `${sessionId}.jsonl`);
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function sessionMetadataFromFile(filePath, sessionId) {
  const text = await readTail(filePath, 512 * 1024);
  let cwd = "";
  let title = "";
  let preview = "";
  let createdAtMs = 0;
  let updatedAtMs = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    cwd ||= cleanText(entry?.cwd, 520);
    if (entry?.type === "ai-title") title ||= cleanText(entry?.aiTitle, 100);
    if (entry?.type === "user") {
      const content = Array.isArray(entry?.message?.content)
        ? entry.message.content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
        : typeof entry?.message?.content === "string"
          ? entry.message.content
          : "";
      const userText = cleanText(content, 1_200);
      preview = userText || preview;
      title ||= cleanText(userText.split(/\r?\n/)[0], 100);
    }
    const timestamp = new Date(entry?.timestamp ?? 0).getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) {
      createdAtMs = createdAtMs ? Math.min(createdAtMs, timestamp) : timestamp;
      updatedAtMs = Math.max(updatedAtMs, timestamp);
    }
  }
  return { sessionId, cwd, title, preview, createdAtMs, updatedAtMs };
}

function safePermissionMode(value) {
  return ALLOWED_PERMISSION_MODES.has(value) ? value : "acceptEdits";
}

export class ClaudeCodeAdapter extends EventEmitter {
  constructor({
    claudeEntry,
    cwd,
    historyPath = path.join(os.homedir(), ".claude", "history.jsonl"),
    projectsRoot = path.join(os.homedir(), ".claude", "projects"),
    permissionMode = process.env.CLAUDE_BRIDGE_PERMISSION_MODE,
    spawnProcess = spawn,
  }) {
    super();
    this.claudeEntry = claudeEntry;
    this.cwd = cwd;
    this.historyPath = historyPath;
    this.projectsRoot = projectsRoot;
    this.permissionMode = safePermissionMode(permissionMode);
    this.spawnProcess = spawnProcess;
    this.virtualSessions = new Map();
    this.sessionIndex = new Map();
    this.active = new Map();
  }

  get activeCount() {
    return this.active.size;
  }

  async loadHistory() {
    const sessions = parseClaudeHistory(await readTail(this.historyPath));
    for (const session of this.virtualSessions.values()) {
      if (!sessions.some((candidate) => candidate.sessionId === session.sessionId)) {
        sessions.push(session);
      }
    }
    this.sessionIndex = new Map(
      sessions.map((session) => [session.sessionId, session]),
    );
    return sessions;
  }

  async listSessions({ limit = 20, cursor = null } = {}) {
    const normalizedLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    const offset = Math.max(0, Number(cursor) || 0);
    const sessions = await this.loadHistory();
    sessions.sort(
      (left, right) =>
        (right.updatedAtMs || right.createdAtMs || 0) -
        (left.updatedAtMs || left.createdAtMs || 0),
    );
    const page = sessions.slice(offset, offset + normalizedLimit);
    return {
      data: page.map((session) =>
        presentSession(
          session,
          this.active.has(toClaudeThreadId(session.sessionId)),
        ),
      ),
      nextCursor:
        offset + normalizedLimit < sessions.length
          ? String(offset + normalizedLimit)
          : null,
    };
  }

  createSession({ name = "새 Claude Code 세션", cwd = this.cwd } = {}) {
    const now = Date.now();
    const session = {
      sessionId: randomUUID(),
      cwd,
      title: cleanText(name, 100) || "새 Claude Code 세션",
      preview: "Agent Forest에서 첫 작업을 기다리고 있어요.",
      createdAtMs: now,
      updatedAtMs: now,
      isNew: true,
    };
    this.virtualSessions.set(session.sessionId, session);
    this.sessionIndex.set(session.sessionId, session);
    return presentSession(session, false);
  }

  async resolveSession(threadId) {
    const sessionId = fromClaudeThreadId(threadId);
    if (!sessionId) throw new Error("올바른 Claude Code 세션이 아닙니다.");
    let session = this.virtualSessions.get(sessionId) ?? this.sessionIndex.get(sessionId);
    if (!session) {
      await this.loadHistory();
      session = this.sessionIndex.get(sessionId);
    }
    if (!session) {
      const filePath = await findClaudeSessionFile(this.projectsRoot, sessionId);
      if (filePath) session = await sessionMetadataFromFile(filePath, sessionId);
    }
    if (!session) throw new Error("Claude Code 세션을 찾지 못했습니다.");
    this.sessionIndex.set(sessionId, session);
    return session;
  }

  async resumeSession(threadId) {
    const session = await this.resolveSession(threadId);
    return presentSession(session, this.active.has(threadId));
  }

  async startTurn(
    threadId,
    prompt,
    {
      agentName = "Agent Forest 고양이",
      runId = `claude-turn-${randomUUID()}`,
    } = {},
  ) {
    if (!this.claudeEntry) throw new Error("Claude Code CLI를 찾지 못했습니다.");
    if (this.active.has(threadId)) {
      throw new Error("이 Claude Code 세션은 이미 작업 중입니다.");
    }
    const session = await this.resolveSession(threadId);
    const sessionId = fromClaudeThreadId(threadId);
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      this.permissionMode,
    ];
    if (session.isNew) {
      args.push(
        "--session-id",
        sessionId,
        "--name",
        cleanText(`Agent Forest · ${agentName}`, 80),
      );
    } else {
      args.push("--resume", sessionId);
    }
    args.push("--", prompt);

    const child = this.spawnProcess(this.claudeEntry, args, {
      cwd: session.cwd || this.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const run = {
      child,
      runId,
      threadId,
      stderr: "",
      hadResult: false,
      interrupted: false,
    };
    this.active.set(threadId, run);

    const lines = readline.createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (message?.type === "result") run.hadResult = true;
      this.emit("message", { threadId, runId, message });
    });
    child.stderr.on("data", (chunk) => {
      run.stderr = cleanText(`${run.stderr}${chunk.toString("utf8")}`, 4_000);
    });
    child.once("error", (error) => {
      this.active.delete(threadId);
      this.emit("processError", { threadId, runId, error });
    });
    child.once("close", (code, signal) => {
      this.active.delete(threadId);
      if (session.isNew) {
        session.isNew = false;
        this.virtualSessions.delete(sessionId);
      }
      this.emit("close", {
        threadId,
        runId,
        code,
        signal,
        stderr: run.stderr,
        hadResult: run.hadResult,
        interrupted: run.interrupted,
      });
    });

    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    return { threadId, turnId: runId, taskId: runId };
  }

  interrupt(threadId) {
    const run = this.active.get(threadId);
    if (!run) throw new Error("중단할 Claude Code 작업을 찾지 못했습니다.");
    run.interrupted = true;
    run.child.kill();
    return { interrupted: true, turnId: run.runId };
  }

  shutdown() {
    for (const run of this.active.values()) {
      run.interrupted = true;
      run.child.kill();
    }
  }
}

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CloudRelay,
  loadOrCreateRelayIdentity,
} from "./cloud-relay.mjs";
import { CodexAppServerClient } from "./codex-app-server-client.mjs";
import {
  createSimulationEvents,
  mapCodexEvent,
} from "./event-mapper.mjs";
import { PairingAttemptLimiter, PairingStore } from "./pairing-store.mjs";
import { isSafeReadOnlyCommand } from "./security-policy.mjs";
import {
  presentThread,
  presentThreadPage,
  safeText,
} from "./session-view.mjs";

const bridgeDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(bridgeDir, "..");
const host = process.env.AGENT_BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_BRIDGE_PORT ?? 4317);
const relayUrl =
  process.env.AGENT_FOREST_RELAY_URL ??
  "https://agent-forest-raccoon.sminia82.chatgpt.site";
const relayEnabled = relayUrl.toLowerCase() !== "off";
const workspace = path.resolve(
  process.env.CODEX_BRIDGE_WORKSPACE ?? projectRoot,
);
const allowedDepartments = new Set(["general", "coding", "design", "music"]);
const departmentLabels = {
  general: "General",
  coding: "Coding",
  design: "Design",
  music: "Music",
};
const departmentAgents = {
  general: "manager-momo",
  coding: "coder-toto",
  design: "designer-bori",
  music: "musician-coco",
};
const defaultAllowedOrigins = new Set([
  "https://agent-forest-raccoon.sminia82.chatgpt.site",
]);
for (const origin of (process.env.AGENT_BRIDGE_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)) {
  defaultAllowedOrigins.add(origin);
}

const pairingStore = new PairingStore(
  path.join(projectRoot, ".agent-forest-pairing.json"),
);
const pairingCode =
  process.env.AGENT_BRIDGE_PAIRING_CODE ?? pairingStore.pairingCode;
const pairingAttemptLimiter = new PairingAttemptLimiter();
const clients = new Set();
const threadContexts = new Map();
const activeTurns = new Map();
const pendingApprovals = new Map();
const itemCache = new Map();
let sequence = 0;
let appServerClient = null;
let appServerPromise = null;
let appServerError = null;
let lastRunOk = null;
let cloudRelay = null;
let appServerRestartTimer = null;
let appServerRestartAttempt = 0;
let shuttingDown = false;

function resolveCodexEntry() {
  const candidates = [
    process.env.CODEX_JS_ENTRY,
    process.platform === "win32" && process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "npm",
          "node_modules",
          "@openai",
          "codex",
          "bin",
          "codex.js",
        )
      : null,
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const codexEntry = resolveCodexEntry();
const codexVersion = codexEntry
  ? spawnSync(process.execPath, [codexEntry, "--version"], {
      encoding: "utf8",
      windowsHide: true,
    }).stdout.trim()
  : null;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    ) {
      return true;
    }
    return url.protocol === "https:" && defaultAllowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  return {
    ...(isAllowedOrigin(origin)
      ? { "Access-Control-Allow-Origin": origin || "*" }
      : {}),
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function sendJson(response, request, statusCode, body) {
  response.writeHead(statusCode, {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64_000) {
      throw new Error("요청 내용이 너무 큽니다.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bearerToken(request, requestUrl, { allowQuery = false } = {}) {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice(7);
  }
  return allowQuery ? requestUrl.searchParams.get("token") ?? "" : "";
}

function isAuthorized(request, requestUrl) {
  const token = bearerToken(request, requestUrl, {
    allowQuery: requestUrl.pathname === "/events",
  });
  return pairingStore.hasToken(token);
}

function requireAuthorization(request, response, requestUrl) {
  if (isAuthorized(request, requestUrl)) return true;
  sendJson(response, request, 401, {
    error: "PC Companion 연결 코드가 필요합니다.",
    requiresPairing: true,
  });
  return false;
}

function publicState({ paired = false } = {}) {
  return {
    connected: true,
    provider: "codex-app-server",
    available: Boolean(codexEntry),
    version: codexVersion,
    appServerConnected: Boolean(appServerClient?.ready),
    running: activeTurns.size > 0,
    activeSessionCount: activeTurns.size,
    pendingApprovalCount: pendingApprovals.size,
    lastRunOk,
    paired,
    requiresPairing: !paired,
    bridge: `http://${host}:${port}`,
    cloudRelay: cloudRelay?.status() ?? {
      enabled: relayEnabled,
      online: false,
      relayUrl: relayEnabled ? relayUrl : null,
      lastError: null,
    },
  };
}

function broadcast(payload) {
  const event = {
    id: `evt_${++sequence}`,
    occurredAt: payload.occurredAt ?? new Date().toISOString(),
    ...payload,
  };
  const message = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(message);
  cloudRelay?.publishEvent(event);
  return event;
}

function serializableApproval(requestId, approval) {
  const context = contextFor(approval.threadId);
  const copy = approval.copy ?? approvalCopy(approval.method, approval.params);
  return {
    id: `snapshot_${requestId}`,
    type: "approval.required",
    occurredAt: approval.occurredAt ?? new Date().toISOString(),
    requestId,
    approvalKind: copy?.kind,
    taskId: approval.params.turnId ?? context.taskId,
    threadId: approval.threadId,
    turnId: approval.params.turnId ?? context.turnId,
    agentId: context.agentId,
    department: context.department,
    status: "waiting_approval",
    location: "office",
    title: copy?.title ?? "승인이 필요해요",
    detail: copy?.detail ?? "PC의 Codex가 확인을 기다리고 있어요.",
    command: copy?.command ?? "",
    files: copy?.files ?? [],
    permissions: copy?.permissions ?? null,
    usage: context.usage ?? null,
    source: "codex",
  };
}

function pendingApprovalSnapshot() {
  return [...pendingApprovals.entries()].map(([requestId, approval]) =>
    serializableApproval(requestId, approval),
  );
}

function notifyLocalOS(title, detail) {
  try {
    if (process.platform === "win32") {
      const title64 = Buffer.from(String(title), "utf8").toString("base64");
      const detail64 = Buffer.from(String(detail), "utf8").toString("base64");
      const script = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        `$title=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${title64}'))`,
        `$detail=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${detail64}'))`,
        "$notice=New-Object System.Windows.Forms.NotifyIcon",
        "$notice.Icon=[System.Drawing.SystemIcons]::Information",
        "$notice.BalloonTipTitle=$title",
        "$notice.BalloonTipText=$detail",
        "$notice.Visible=$true",
        "$notice.ShowBalloonTip(7000)",
        "Start-Sleep -Seconds 8",
        "$notice.Dispose()",
      ].join("; ");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        { detached: true, stdio: "ignore", windowsHide: true },
      ).unref();
      return;
    }
    if (process.platform === "linux") {
      spawn("notify-send", [String(title), String(detail)], {
        detached: true,
        stdio: "ignore",
      }).unref();
    }
  } catch {
    // A notification failure must never block an approval event.
  }
}

function contextFor(threadId, overrides = {}) {
  const current = threadContexts.get(threadId) ?? {
    threadId,
    taskId: `task_${randomUUID()}`,
    turnId: null,
    prompt: "",
    department: "coding",
    departmentLabel: departmentLabels.coding,
    agentId: departmentAgents.coding,
    mode: "codex",
    lastMessage: "",
    usage: null,
  };
  const department = allowedDepartments.has(overrides.department)
    ? overrides.department
    : current.department;
  const next = {
    ...current,
    ...overrides,
    department,
    departmentLabel: departmentLabels[department],
    agentId: departmentAgents[department],
  };
  threadContexts.set(threadId, next);
  return next;
}

function createContext(body, mode, threadId = null) {
  const department = allowedDepartments.has(body.department)
    ? body.department
    : "coding";
  return {
    taskId: `task_${randomUUID()}`,
    threadId,
    turnId: null,
    agentId: departmentAgents[department],
    department,
    departmentLabel: departmentLabels[department],
    prompt: safeText(body.prompt, 4_000),
    mode,
    lastMessage: "",
  };
}

function extractItemText(item) {
  if (!item || typeof item !== "object") return "";
  if (typeof item.text === "string") return safeText(item.text, 4_000);
  if (typeof item.content === "string") return safeText(item.content, 4_000);
  if (Array.isArray(item.content)) {
    return safeText(
      item.content
        .map((part) =>
          typeof part === "string"
            ? part
            : typeof part?.text === "string"
              ? part.text
              : "",
        )
        .join("\n"),
      4_000,
    );
  }
  return "";
}

function cacheItem(threadId, turnId, item) {
  if (!item?.id) return;
  itemCache.set(item.id, {
    threadId,
    turnId,
    item,
    cachedAt: Date.now(),
  });
  if (itemCache.size > 300) {
    const oldest = [...itemCache.entries()]
      .sort((left, right) => left[1].cachedAt - right[1].cachedAt)
      .slice(0, itemCache.size - 250);
    oldest.forEach(([key]) => itemCache.delete(key));
  }
}

function approvalItem(params) {
  const itemId = params.itemId ?? params.item?.id;
  return (itemId && itemCache.get(itemId)?.item) || params.item || null;
}

function handleNotification({ method, params }) {
  const threadId = params.threadId ?? params.thread?.id ?? null;
  if (method === "thread/started" && params.thread) {
    broadcast({
      type: "session.updated",
      session: presentThread(params.thread),
      threadId: params.thread.id,
      source: "codex",
    });
    if (!threadId) return;
  }

  if (method === "thread/status/changed" && params.thread) {
    broadcast({
      type: "session.updated",
      session: presentThread(params.thread),
      threadId: params.thread.id,
      source: "codex",
    });
    return;
  }

  if (!threadId) return;
  const context = contextFor(threadId);
  context.threadId = threadId;

  if (method === "turn/started") {
    const turnId = params.turn?.id ?? params.turnId ?? null;
    context.turnId = turnId;
    context.taskId = turnId ?? context.taskId;
    context.lastMessage = "";
    if (turnId) activeTurns.set(threadId, turnId);
  }

  if (method === "item/started") {
    cacheItem(threadId, params.turnId ?? context.turnId, params.item);
  }

  if (method === "item/agentMessage/delta") {
    context.lastMessage = safeText(
      `${context.lastMessage}${params.delta ?? ""}`,
      4_000,
    );
    return;
  }

  if (method === "item/completed") {
    cacheItem(threadId, params.turnId ?? context.turnId, params.item);
    const itemType = params.item?.type ?? "unknown";
    if (itemType === "agentMessage") {
      const result = extractItemText(params.item) || context.lastMessage;
      context.lastMessage = result;
    }
  }

  if (method === "thread/tokenUsage/updated") {
    const usage = params.tokenUsage ?? params.usage ?? null;
    context.usage = usage;
    broadcast({
      type: "session.usage",
      taskId: context.taskId,
      threadId,
      agentId: context.agentId,
      department: context.department,
      usage,
      source: "codex",
    });
    return;
  }

  if (method === "turn/completed") {
    const turn = params.turn ?? {};
    activeTurns.delete(threadId);
    lastRunOk = turn.status === "completed";
    for (const [itemId, cached] of itemCache) {
      if (
        cached.threadId === threadId &&
        (!cached.turnId || cached.turnId === (turn.id ?? context.turnId))
      ) {
        itemCache.delete(itemId);
      }
    }
  }

  for (const event of mapCodexEvent({ method, params }, context)) {
    broadcast(event);
  }

  if (method === "turn/completed") {
    broadcast({ type: "bridge.status", ...publicState(), source: "bridge" });
  }
}

function approvalCopy(method, params) {
  const cachedItem = approvalItem(params);
  if (method === "item/commandExecution/requestApproval") {
    return {
      kind: "command",
      title: "명령 실행 승인이 필요해요",
      detail:
        safeText(params.reason, 400) ||
        "Codex가 PC에서 명령을 실행하기 전에 확인을 요청했어요.",
      command: safeText(params.command ?? cachedItem?.command, 1_200),
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      kind: "fileChange",
      title: "파일 변경 승인이 필요해요",
      detail:
        safeText(params.reason, 400) ||
        "Codex가 프로젝트 파일을 변경하기 전에 확인을 요청했어요.",
      command: "",
      files: Array.isArray(params.changes ?? cachedItem?.changes)
        ? (params.changes ?? cachedItem?.changes).slice(0, 20)
        : Array.isArray(params.files ?? cachedItem?.files)
          ? (params.files ?? cachedItem?.files).slice(0, 20)
          : [],
      permissions: null,
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      kind: "permissions",
      title: "추가 권한 승인이 필요해요",
      detail:
        safeText(params.reason, 400) ||
        "Codex가 현재 작업에 필요한 추가 권한을 요청했어요.",
      command: "",
      files: [],
      permissions: params.permissions ?? cachedItem?.permissions ?? {},
    };
  }
  return null;
}

function handleServerRequest({ id, method, params }) {
  const copy = approvalCopy(method, params);
  if (!copy) {
    appServerClient?.respondError(
      id,
      -32601,
      "Agent Forest Companion에서 아직 지원하지 않는 요청입니다.",
    );
    return;
  }

  if (
    isSafeReadOnlyCommand(
      "command_execution",
      params.command ?? approvalItem(params)?.command,
    )
  ) {
    appServerClient?.respond(id, { decision: "accept" });
    const context = contextFor(params.threadId);
    broadcast({
      type: "approval.autoApproved",
      taskId: params.turnId ?? context.taskId,
      threadId: params.threadId,
      turnId: params.turnId ?? context.turnId,
      agentId: context.agentId,
      department: context.department,
      status: "working",
      location: context.department,
      title: "읽기 전용 명령을 자동 승인했어요",
      detail: copy.command,
      source: "bridge",
    });
    return;
  }

  const requestId = `approval_${randomUUID()}`;
  const threadId = params.threadId;
  const context = contextFor(threadId);
  pendingApprovals.set(requestId, {
    rpcId: id,
    method,
    params,
    threadId,
    copy,
    occurredAt: new Date().toISOString(),
  });
  const approvalEvent = broadcast({
    type: "approval.required",
    requestId,
    approvalKind: copy.kind,
    taskId: params.turnId ?? context.taskId,
    threadId,
    turnId: params.turnId ?? context.turnId,
    agentId: context.agentId,
    department: context.department,
    status: "waiting_approval",
    location: "office",
    title: copy.title,
    detail: copy.detail,
    command: copy.command,
    files: copy.files ?? [],
    permissions: copy.permissions ?? null,
    usage: context.usage ?? null,
    availableDecisions: params.availableDecisions ?? null,
    source: "codex",
  });
  const pending = pendingApprovals.get(requestId);
  if (pending) pending.occurredAt = approvalEvent.occurredAt;
  notifyLocalOS(copy.title, copy.detail);
}

async function ensureAppServer() {
  if (appServerClient?.ready) return appServerClient;
  if (appServerPromise) return appServerPromise;
  if (!codexEntry) throw new Error("Codex CLI를 찾지 못했습니다.");

  appServerPromise = (async () => {
    const client = new CodexAppServerClient({
      codexEntry,
      cwd: workspace,
    });
    appServerClient = client;
    client.on("notification", handleNotification);
    client.on("request", handleServerRequest);
    client.on("protocolError", () => {
      broadcast({
        type: "bridge.warning",
        title: "Codex 이벤트 하나를 읽지 못했어요",
        detail: "연결은 유지되며 다음 이벤트를 계속 기다립니다.",
        source: "bridge",
      });
    });
    client.on("close", (error) => {
      appServerError = safeText(error?.message, 260);
      appServerPromise = null;
      appServerClient = null;
      activeTurns.clear();
      pendingApprovals.clear();
      broadcast({
        type: "bridge.status",
        ...publicState(),
        detail: appServerError,
        source: "bridge",
      });
      scheduleAppServerRestart();
    });
    await client.start();
    appServerRestartAttempt = 0;
    appServerError = null;
    broadcast({ type: "bridge.status", ...publicState(), source: "bridge" });
    return client;
  })();

  try {
    return await appServerPromise;
  } catch (error) {
    appServerError = safeText(error?.message, 260);
    appServerPromise = null;
    appServerClient = null;
    throw error;
  }
}

function scheduleAppServerRestart() {
  if (shuttingDown || !codexEntry || appServerRestartTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** appServerRestartAttempt);
  appServerRestartAttempt += 1;
  appServerRestartTimer = setTimeout(() => {
    appServerRestartTimer = null;
    void ensureAppServer().catch((error) => {
      appServerError = safeText(error?.message, 260);
      broadcast({
        type: "bridge.status",
        ...publicState(),
        detail: `Codex 재연결 대기: ${appServerError}`,
        source: "bridge",
      });
      scheduleAppServerRestart();
    });
  }, delay);
  appServerRestartTimer.unref?.();
}

async function listSessions(requestUrl) {
  const client = await ensureAppServer();
  const requestedLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
  const limit = Math.max(1, Math.min(50, requestedLimit || 20));
  const cursor = requestUrl.searchParams.get("cursor");
  const result = await client.request(
    "thread/list",
    {
      limit,
      cursor: cursor || null,
      archived: false,
      sortKey: "recency_at",
      sortDirection: "desc",
      useStateDbOnly: true,
    },
    45_000,
  );
  return presentThreadPage(result);
}

async function createSession() {
  const client = await ensureAppServer();
  const result = await client.request("thread/start", {
    cwd: workspace,
    ephemeral: false,
    experimentalRawEvents: false,
  });
  return presentThread(result.thread);
}

async function resumeSession(threadId) {
  const client = await ensureAppServer();
  const result = await client.request(
    "thread/resume",
    { threadId },
    45_000,
  );
  return presentThread(result.thread);
}

async function startTurn(threadId, body) {
  const prompt = safeText(body.prompt, 4_000);
  const displayPrompt = safeText(body.displayPrompt, 2_000) || prompt;
  if (!prompt) throw new Error("작업 내용을 입력해 주세요.");
  const client = await ensureAppServer();
  await client.request("thread/resume", { threadId }, 45_000);
  const context = contextFor(
    threadId,
    createContext(body, "codex", threadId),
  );
  broadcast({
    type: "task.queued",
    taskId: context.taskId,
    threadId,
    agentId: context.agentId,
    department: context.department,
    status: "queued",
    location: "general",
    title: "선택한 Codex 세션에 작업을 전달했어요",
    detail: displayPrompt.slice(0, 220),
    prompt: displayPrompt,
    mode: "codex",
    source: "bridge",
  });
  const result = await client.request("turn/start", {
    threadId,
    input: [{ type: "text", text: prompt }],
  });
  const turnId = result.turn?.id ?? null;
  context.turnId = turnId;
  context.taskId = turnId ?? context.taskId;
  if (turnId) activeTurns.set(threadId, turnId);
  return { threadId, turnId, taskId: context.taskId };
}

async function respondApproval(requestId, decision) {
  const approval = pendingApprovals.get(requestId);
  if (!approval) throw new Error("이미 처리되었거나 찾을 수 없는 승인 요청입니다.");
  const accepted = decision === "approve";
  const cancelled = decision === "cancel";
  let result;
  if (approval.method === "item/permissions/requestApproval") {
    result = {
      permissions: accepted
        ? approval.params.permissions ?? approval.copy?.permissions ?? {}
        : {},
      scope: "turn",
    };
  } else {
    result = {
      decision: accepted ? "accept" : cancelled ? "cancel" : "decline",
    };
  }
  appServerClient?.respond(approval.rpcId, result);
  pendingApprovals.delete(requestId);
  const context = contextFor(approval.threadId);
  broadcast({
    type: "approval.decided",
    requestId,
    threadId: approval.threadId,
    turnId: approval.params.turnId,
    taskId: approval.params.turnId ?? context.taskId,
    agentId: context.agentId,
    department: context.department,
    decision,
    status: cancelled ? "failed" : "working",
    location: cancelled ? "general" : context.department,
    title: accepted
      ? "승인 내용을 Codex에 전달했어요"
      : cancelled
        ? "작업을 취소했어요"
        : "요청을 거절하고 작업을 계속해요",
    detail: "결정은 해당 승인 요청 한 건에만 적용됩니다.",
    source: "bridge",
  });
}

function runSimulation(context) {
  const scheduled = createSimulationEvents(context);
  for (const { delayMs, event } of scheduled) {
    setTimeout(() => broadcast(event), delayMs);
  }
  setTimeout(() => {
    lastRunOk = true;
    broadcast({ type: "bridge.status", ...publicState(), source: "bridge" });
  }, Math.max(...scheduled.map(({ delayMs }) => delayMs)) + 300);
}

async function relaySnapshot() {
  let sessions = [];
  try {
    const page = await listSessions(new URL("http://relay/v2/sessions?limit=30"));
    sessions = page.data ?? [];
  } catch {
    // Health still reaches the browser while Codex is starting or reconnecting.
  }
  return {
    ...publicState({ paired: false }),
    sessions,
    pendingApprovals: pendingApprovalSnapshot(),
    workspaceName: path.basename(workspace),
    updatedAt: new Date().toISOString(),
  };
}

async function executeRelayCommand(command) {
  if (String(command.method ?? "").toUpperCase() !== "POST") {
    throw new Error("허용되지 않은 외부 명령 방식입니다.");
  }
  const commandUrl = new URL(command.path, "http://relay");
  const body = command.body && typeof command.body === "object" ? command.body : {};

  if (commandUrl.pathname === "/v2/sessions") {
    return { session: await createSession() };
  }

  const sessionMatch = commandUrl.pathname.match(
    /^\/v2\/sessions\/([^/]+)\/(resume|turns|steer|interrupt)$/,
  );
  if (sessionMatch) {
    const threadId = decodeURIComponent(sessionMatch[1]);
    const action = sessionMatch[2];
    if (action === "resume") {
      return { session: await resumeSession(threadId) };
    }
    if (action === "turns") {
      return { accepted: true, ...(await startTurn(threadId, body)) };
    }
    if (action === "steer") {
      const turnId = activeTurns.get(threadId);
      const prompt = safeText(body.prompt, 2_000);
      if (!turnId || !prompt) {
        throw new Error("추가 지시를 보낼 활성 작업을 찾지 못했습니다.");
      }
      const client = await ensureAppServer();
      const result = await client.request("turn/steer", {
        threadId,
        expectedTurnId: turnId,
        input: [{ type: "text", text: prompt }],
      });
      return { accepted: true, turnId: result.turnId ?? turnId };
    }
    if (action === "interrupt") {
      const turnId = activeTurns.get(threadId);
      if (!turnId) throw new Error("중단할 활성 작업을 찾지 못했습니다.");
      const client = await ensureAppServer();
      await client.request("turn/interrupt", { threadId, turnId });
      return { interrupted: true, turnId };
    }
  }

  const approvalMatch = commandUrl.pathname.match(
    /^\/v2\/approvals\/([^/]+)$/,
  );
  if (approvalMatch) {
    const decision = ["approve", "reject", "cancel"].includes(body.decision)
      ? body.decision
      : null;
    if (!decision) throw new Error("올바른 승인 결정을 선택해 주세요.");
    await respondApproval(decodeURIComponent(approvalMatch[1]), decision);
    return { saved: true };
  }

  if (commandUrl.pathname === "/simulate") {
    if (!safeText(body.prompt, 2_000)) {
      throw new Error("작업 내용을 입력해 주세요.");
    }
    const context = createContext(body, "simulation");
    broadcast({
      type: "task.queued",
      taskId: context.taskId,
      agentId: context.agentId,
      department: context.department,
      status: "queued",
      location: "general",
      title: "화면 시연을 시작해요",
      detail: context.prompt.slice(0, 220),
      prompt: context.prompt,
      mode: "simulation",
      source: "bridge",
    });
    runSimulation(context);
    return { accepted: true, taskId: context.taskId, mode: "simulation" };
  }

  throw new Error("허용되지 않은 외부 명령입니다.");
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    sendJson(response, request, 403, { error: "허용되지 않은 출처입니다." });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(
      response,
      request,
      200,
      publicState({ paired: isAuthorized(request, requestUrl) }),
    );
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/v2/pair") {
    try {
      const forwardedAddress = String(
        request.headers["x-forwarded-for"] ?? request.socket.remoteAddress ?? "",
      )
        .split(",")[0]
        .trim();
      if (!pairingAttemptLimiter.check(forwardedAddress || "unknown")) {
        sendJson(response, request, 429, {
          error: "연결 시도가 너무 많습니다. 잠시 뒤 다시 시도해 주세요.",
        });
        return;
      }
      const body = await readJson(request);
      if (String(body.code ?? "").trim() !== pairingCode) {
        sendJson(response, request, 401, {
          error: "연결 코드가 올바르지 않습니다.",
        });
        return;
      }
      const token = randomUUID().replaceAll("-", "");
      pairingStore.addToken(token);
      pairingAttemptLimiter.clear(forwardedAddress || "unknown");
      sendJson(response, request, 200, {
        paired: true,
        token,
        companion: publicState({ paired: true }),
      });
    } catch (error) {
      sendJson(response, request, 400, {
        error: error instanceof Error ? error.message : "연결에 실패했습니다.",
      });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/events") {
    if (!requireAuthorization(request, response, requestUrl)) return;
    response.writeHead(200, {
      ...corsHeaders(request),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write("retry: 1500\n");
    response.write(
      `data: ${JSON.stringify({
        id: `evt_${++sequence}`,
        type: "bridge.snapshot",
        occurredAt: new Date().toISOString(),
        ...publicState({ paired: true }),
        pendingApprovals: pendingApprovalSnapshot(),
        source: "bridge",
      })}\n\n`,
    );
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (!requireAuthorization(request, response, requestUrl)) return;

  try {
    if (request.method === "GET" && requestUrl.pathname === "/v2/sessions") {
      sendJson(response, request, 200, await listSessions(requestUrl));
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v2/sessions") {
      sendJson(response, request, 201, { session: await createSession() });
      return;
    }

    const sessionMatch = requestUrl.pathname.match(
      /^\/v2\/sessions\/([^/]+)(?:\/(resume|turns|steer|interrupt))?$/,
    );
    if (sessionMatch) {
      const threadId = decodeURIComponent(sessionMatch[1]);
      const action = sessionMatch[2] ?? "read";
      if (request.method === "GET" && action === "read") {
        const client = await ensureAppServer();
        const result = await client.request("thread/read", {
          threadId,
          includeTurns: false,
        });
        sendJson(response, request, 200, {
          session: presentThread(result.thread),
        });
        return;
      }
      if (request.method === "POST" && action === "resume") {
        sendJson(response, request, 200, {
          session: await resumeSession(threadId),
        });
        return;
      }
      if (request.method === "POST" && action === "turns") {
        const body = await readJson(request);
        sendJson(response, request, 202, {
          accepted: true,
          ...(await startTurn(threadId, body)),
        });
        return;
      }
      if (request.method === "POST" && action === "steer") {
        const body = await readJson(request);
        const turnId = activeTurns.get(threadId);
        const prompt = safeText(body.prompt, 2_000);
        if (!turnId || !prompt) {
          throw new Error("추가 지시를 보낼 활성 작업을 찾지 못했습니다.");
        }
        const client = await ensureAppServer();
        const result = await client.request("turn/steer", {
          threadId,
          expectedTurnId: turnId,
          input: [{ type: "text", text: prompt }],
        });
        sendJson(response, request, 202, {
          accepted: true,
          turnId: result.turnId ?? turnId,
        });
        return;
      }
      if (request.method === "POST" && action === "interrupt") {
        const turnId = activeTurns.get(threadId);
        if (!turnId) throw new Error("중단할 활성 작업을 찾지 못했습니다.");
        const client = await ensureAppServer();
        await client.request("turn/interrupt", { threadId, turnId });
        sendJson(response, request, 202, { interrupted: true, turnId });
        return;
      }
    }

    const approvalMatch = requestUrl.pathname.match(
      /^\/v2\/approvals\/([^/]+)$/,
    );
    if (request.method === "POST" && approvalMatch) {
      const body = await readJson(request);
      const decision = ["approve", "reject", "cancel"].includes(body.decision)
        ? body.decision
        : null;
      if (!decision) throw new Error("올바른 승인 결정을 선택해 주세요.");
      await respondApproval(decodeURIComponent(approvalMatch[1]), decision);
      sendJson(response, request, 200, { saved: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/run") {
      const body = await readJson(request);
      let threadId = safeText(body.threadId, 160);
      if (!threadId) threadId = (await createSession()).id;
      sendJson(response, request, 202, {
        accepted: true,
        ...(await startTurn(threadId, body)),
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/simulate") {
      const body = await readJson(request);
      if (!safeText(body.prompt, 2_000)) {
        throw new Error("작업 내용을 입력해 주세요.");
      }
      const context = createContext(body, "simulation");
      broadcast({
        type: "task.queued",
        taskId: context.taskId,
        agentId: context.agentId,
        department: context.department,
        status: "queued",
        location: "general",
        title: "화면 시연을 시작해요",
        detail: context.prompt.slice(0, 220),
        prompt: context.prompt,
        mode: "simulation",
        source: "bridge",
      });
      runSimulation(context);
      sendJson(response, request, 202, {
        accepted: true,
        taskId: context.taskId,
        mode: "simulation",
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/decision") {
      const body = await readJson(request);
      await respondApproval(body.requestId, body.decision);
      sendJson(response, request, 200, { saved: true });
      return;
    }
  } catch (error) {
    sendJson(response, request, 400, {
      error:
        error instanceof Error
          ? safeText(error.message, 400)
          : "요청을 처리하지 못했습니다.",
    });
    return;
  }

  sendJson(response, request, 404, { error: "경로를 찾지 못했습니다." });
});

const ping = setInterval(() => {
  for (const client of clients) client.write(`: ping ${Date.now()}\n\n`);
}, 20_000);
ping.unref();

server.listen(port, host, () => {
  console.log(
    `[agent-companion] http://${host}:${port} · ${codexVersion || "Codex unavailable"}`,
  );
  console.log(`[agent-companion] 연결 코드: ${pairingCode}`);
  if (relayEnabled) {
    const identity = loadOrCreateRelayIdentity(
      path.join(projectRoot, ".agent-forest-companion.json"),
    );
    cloudRelay = new CloudRelay({
      baseUrl: relayUrl,
      deviceId: identity.deviceId,
      secret: identity.secret,
      pairingCode,
      getSnapshot: relaySnapshot,
      executeCommand: executeRelayCommand,
    });
    void cloudRelay.start();
    console.log(`[agent-companion] 외부 연결: ${relayUrl}`);
  }
  void ensureAppServer().catch((error) => {
    appServerError = safeText(error?.message, 260);
    console.error(`[agent-companion] App Server 연결 실패: ${appServerError}`);
    scheduleAppServerRestart();
  });
});

async function shutdown() {
  shuttingDown = true;
  if (appServerRestartTimer) clearTimeout(appServerRestartTimer);
  await cloudRelay?.stop();
  await appServerClient?.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

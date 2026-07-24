import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSimulationEvents, mapCodexEvent } from "./event-mapper.mjs";

const bridgeDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(bridgeDir, "..");
const host = process.env.AGENT_BRIDGE_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_BRIDGE_PORT ?? 4317);
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

const clients = new Set();
let sequence = 0;
let currentChild = null;
let currentTask = null;
let lastRunOk = null;

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
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
    if (length > 32_768) throw new Error("요청 내용이 너무 깁니다.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function publicState() {
  return {
    connected: true,
    provider: "codex",
    available: Boolean(codexEntry),
    version: codexVersion,
    running: Boolean(currentTask),
    currentTask: currentTask
      ? {
          taskId: currentTask.taskId,
          department: currentTask.department,
          prompt: currentTask.prompt,
          mode: currentTask.mode,
        }
      : null,
    lastRunOk,
    bridge: `http://${host}:${port}`,
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
  return event;
}

function createContext(body, mode) {
  const department = allowedDepartments.has(body.department)
    ? body.department
    : "general";
  return {
    taskId: `task_${randomUUID()}`,
    agentId: departmentAgents[department],
    department,
    departmentLabel: departmentLabels[department],
    prompt: body.prompt.trim(),
    mode,
    lastMessage: "",
  };
}

function runCodex(context) {
  if (!codexEntry) {
    lastRunOk = false;
    broadcast({
      type: "task.failed",
      taskId: context.taskId,
      agentId: context.agentId,
      department: context.department,
      status: "failed",
      location: "general",
      title: "Codex를 찾지 못했어요",
      detail: "이 PC에 설치된 Codex CLI 경로를 확인해 주세요.",
      source: "bridge",
    });
    currentTask = null;
    return;
  }

  const sandbox = process.env.CODEX_BRIDGE_SANDBOX ?? "read-only";
  const args = [
    codexEntry,
    "exec",
    "--json",
    "--ephemeral",
    "--color",
    "never",
    "--sandbox",
    sandbox,
    "-C",
    process.env.CODEX_BRIDGE_WORKSPACE ?? projectRoot,
    context.prompt,
  ];

  const child = spawn(process.execPath, args, {
    cwd: process.env.CODEX_BRIDGE_WORKSPACE ?? projectRoot,
    env: { ...process.env, NO_COLOR: "1" },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  currentChild = child;
  child.stdin.end();

  let buffer = "";
  let stderr = "";
  let sawTerminalEvent = false;

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        if (raw.type === "turn.completed" || raw.type === "turn.failed") {
          sawTerminalEvent = true;
        }
        for (const event of mapCodexEvent(raw, context)) broadcast(event);
      } catch {
        // Codex stdout is expected to be JSONL. Non-JSON diagnostic lines are
        // intentionally not sent to the browser because they may contain paths.
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });

  child.on("error", (error) => {
    lastRunOk = false;
    broadcast({
      type: "task.failed",
      taskId: context.taskId,
      agentId: context.agentId,
      department: context.department,
      status: "failed",
      location: context.department,
      title: "Codex 실행을 시작하지 못했어요",
      detail: error.message.slice(0, 260),
      source: "bridge",
    });
  });

  child.on("close", (code) => {
    if (code !== 0 && !sawTerminalEvent) {
      broadcast({
        type: "task.failed",
        taskId: context.taskId,
        agentId: context.agentId,
        department: context.department,
        status: "failed",
        location: context.department,
        title: "Codex 실행이 중단됐어요",
        detail:
          stderr
            .split(/\r?\n/)
            .find((line) => line.trim())
            ?.trim()
            .slice(0, 260) || `종료 코드 ${code}`,
        source: "bridge",
      });
    }
    lastRunOk = code === 0;
    currentChild = null;
    currentTask = null;
    broadcast({ type: "bridge.status", ...publicState(), source: "bridge" });
  });
}

function runSimulation(context) {
  const scheduled = createSimulationEvents(context);
  for (const { delayMs, event } of scheduled) {
    setTimeout(() => broadcast(event), delayMs);
  }
  setTimeout(() => {
    lastRunOk = true;
    currentTask = null;
    broadcast({ type: "bridge.status", ...publicState(), source: "bridge" });
  }, Math.max(...scheduled.map(({ delayMs }) => delayMs)) + 300);
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
    sendJson(response, request, 200, publicState());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/events") {
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
        ...publicState(),
        source: "bridge",
      })}\n\n`,
    );
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (
    request.method === "POST" &&
    (requestUrl.pathname === "/run" || requestUrl.pathname === "/simulate")
  ) {
    if (currentTask) {
      sendJson(response, request, 409, {
        error: "현재 다른 고양이가 작업 중입니다. 완료 후 다시 시도해 주세요.",
      });
      return;
    }

    try {
      const body = await readJson(request);
      if (typeof body.prompt !== "string" || !body.prompt.trim()) {
        sendJson(response, request, 400, { error: "작업 내용을 입력해 주세요." });
        return;
      }
      if (body.prompt.trim().length > 2_000) {
        sendJson(response, request, 400, {
          error: "작업 내용은 2,000자 이하로 입력해 주세요.",
        });
        return;
      }

      const mode = requestUrl.pathname === "/run" ? "codex" : "simulation";
      const context = createContext(body, mode);
      currentTask = context;
      broadcast({
        type: "task.queued",
        taskId: context.taskId,
        agentId: context.agentId,
        department: context.department,
        status: "queued",
        location: "general",
        title: mode === "codex" ? "Codex에게 업무를 전달했어요" : "화면 시연을 시작해요",
        detail: context.prompt.slice(0, 220),
        prompt: context.prompt,
        mode,
        source: "bridge",
      });
      sendJson(response, request, 202, {
        accepted: true,
        taskId: context.taskId,
        mode,
      });

      if (mode === "codex") runCodex(context);
      else runSimulation(context);
    } catch (error) {
      sendJson(response, request, 400, {
        error: error instanceof Error ? error.message : "요청을 읽지 못했어요.",
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/decision") {
    try {
      const body = await readJson(request);
      if (!["approve", "review", "reject"].includes(body.decision)) {
        sendJson(response, request, 400, { error: "올바르지 않은 결정입니다." });
        return;
      }
      broadcast({
        type: "approval.decided",
        taskId: typeof body.taskId === "string" ? body.taskId : null,
        decision: body.decision,
        feedback:
          typeof body.feedback === "string" ? body.feedback.slice(0, 600) : "",
        status: body.decision === "approve" ? "completed" : "idle",
        location: body.decision === "approve" ? "office" : "general",
        title:
          body.decision === "approve"
            ? "보고를 승인했어요"
            : body.decision === "review"
              ? "재검토를 요청했어요"
              : "작업을 반려했어요",
        detail: "사용자 결정이 로컬 브리지에 기록됐어요.",
        source: "bridge",
      });
      sendJson(response, request, 200, { saved: true });
    } catch {
      sendJson(response, request, 400, { error: "결정을 저장하지 못했어요." });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/cancel") {
    if (currentChild) {
      currentChild.kill();
      sendJson(response, request, 202, { cancelled: true });
    } else {
      sendJson(response, request, 409, { error: "실행 중인 Codex 작업이 없습니다." });
    }
    return;
  }

  sendJson(response, request, 404, { error: "경로를 찾지 못했어요." });
});

const ping = setInterval(() => {
  for (const client of clients) client.write(`: ping ${Date.now()}\n\n`);
}, 20_000);
ping.unref();

server.listen(port, host, () => {
  console.log(
    `[agent-bridge] http://${host}:${port} · ${codexVersion || "Codex unavailable"}`,
  );
});

function shutdown() {
  if (currentChild) currentChild.kill();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

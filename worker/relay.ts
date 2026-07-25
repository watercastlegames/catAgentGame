type RelayEnv = {
  DB: D1Database;
};

type DeviceRow = {
  device_id: string;
  secret_hash: string;
  snapshot_json: string;
  last_seen_at: number;
};

type BrowserSessionRow = {
  device_id: string;
  expires_at: number;
};

type CommandRow = {
  id: string;
  method: string;
  path: string;
  payload_json: string;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const ONLINE_WINDOW_MS = 60_000;
const PAIR_WINDOW_MS = 10 * 60_000;
const BROWSER_SESSION_MS = 30 * 24 * 60 * 60_000;
const MAX_PAIR_ATTEMPTS = 20;

let schemaReady: Promise<void> | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value)
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function bearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function readBody(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 128_000) throw new Error("요청 내용이 너무 큽니다.");
  const text = await request.text();
  if (!text) return {};
  if (text.length > 128_000) throw new Error("요청 내용이 너무 큽니다.");
  return JSON.parse(text) as Record<string, unknown>;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS relay_devices (
          device_id TEXT PRIMARY KEY NOT NULL,
          secret_hash TEXT NOT NULL,
          pairing_code_hash TEXT NOT NULL,
          pairing_expires_at INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL DEFAULT '{}',
          last_seen_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`),
        db.prepare(`CREATE INDEX IF NOT EXISTS relay_devices_pairing_idx
          ON relay_devices (pairing_code_hash, pairing_expires_at)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS relay_devices_seen_idx
          ON relay_devices (last_seen_at)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS relay_browser_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          token_hash TEXT NOT NULL,
          device_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (device_id) REFERENCES relay_devices(device_id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS relay_browser_sessions_token_idx
          ON relay_browser_sessions (token_hash)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS relay_browser_sessions_device_idx
          ON relay_browser_sessions (device_id)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS relay_commands (
          id TEXT PRIMARY KEY NOT NULL,
          device_id TEXT NOT NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'queued',
          result_json TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          claimed_at INTEGER,
          completed_at INTEGER,
          FOREIGN KEY (device_id) REFERENCES relay_devices(device_id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE INDEX IF NOT EXISTS relay_commands_queue_idx
          ON relay_commands (device_id, status, created_at)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS relay_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          device_id TEXT NOT NULL,
          event_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (device_id) REFERENCES relay_devices(device_id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE INDEX IF NOT EXISTS relay_events_device_idx
          ON relay_events (device_id, id)`),
        db.prepare(`CREATE TABLE IF NOT EXISTS relay_pair_attempts (
          client_hash TEXT PRIMARY KEY NOT NULL,
          window_started_at INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0
        )`),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function authenticateDevice(request: Request, db: D1Database) {
  const deviceId = request.headers.get("x-agent-forest-device") ?? "";
  const secret = bearer(request);
  if (!deviceId || !secret) return null;
  const row = await db
    .prepare(
      `SELECT device_id, secret_hash, snapshot_json, last_seen_at
       FROM relay_devices WHERE device_id = ?`,
    )
    .bind(deviceId)
    .first<DeviceRow>();
  if (!row || row.secret_hash !== (await hash(secret))) return null;
  return row;
}

async function authenticateBrowser(request: Request, db: D1Database) {
  const token = bearer(request);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT device_id, expires_at FROM relay_browser_sessions
       WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(await hash(token), Date.now())
    .first<BrowserSessionRow>();
  return row ?? null;
}

async function registerDevice(request: Request, db: D1Database) {
  const body = await readBody(request);
  const deviceId = String(body.deviceId ?? "");
  const secret = bearer(request);
  const pairingCode = String(body.pairingCode ?? "");
  const snapshot = body.snapshot ?? {};
  const now = Date.now();
  const pairingExpiresAt = Math.min(
    Number(body.pairingExpiresAt ?? now + PAIR_WINDOW_MS),
    now + PAIR_WINDOW_MS,
  );

  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(deviceId) || secret.length < 32) {
    return json({ error: "기기 인증 정보가 올바르지 않습니다." }, 400);
  }
  if (!/^\d{6}$/.test(pairingCode)) {
    return json({ error: "6자리 연결 코드가 필요합니다." }, 400);
  }

  const secretHash = await hash(secret);
  const existing = await db
    .prepare("SELECT secret_hash FROM relay_devices WHERE device_id = ?")
    .bind(deviceId)
    .first<{ secret_hash: string }>();
  if (existing && existing.secret_hash !== secretHash) {
    return json({ error: "등록된 기기 비밀키와 일치하지 않습니다." }, 401);
  }

  await db
    .prepare(
      `INSERT INTO relay_devices
        (device_id, secret_hash, pairing_code_hash, pairing_expires_at,
         snapshot_json, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         secret_hash = excluded.secret_hash,
         pairing_code_hash = excluded.pairing_code_hash,
         pairing_expires_at = excluded.pairing_expires_at,
         snapshot_json = excluded.snapshot_json,
         last_seen_at = excluded.last_seen_at,
         updated_at = excluded.updated_at`,
    )
    .bind(
      deviceId,
      secretHash,
      await hash(pairingCode),
      pairingExpiresAt,
      JSON.stringify(snapshot).slice(0, 100_000),
      now,
      now,
      now,
    )
    .run();

  if (Math.random() < 0.05) {
    await db.batch([
      db
        .prepare("DELETE FROM relay_browser_sessions WHERE expires_at <= ?")
        .bind(now),
      db
        .prepare("DELETE FROM relay_events WHERE created_at < ?")
        .bind(now - 24 * 60 * 60_000),
      db
        .prepare(
          "DELETE FROM relay_commands WHERE completed_at IS NOT NULL AND completed_at < ?",
        )
        .bind(now - 24 * 60 * 60_000),
    ]);
  }

  return json({ registered: true, online: true });
}

async function pairBrowser(request: Request, db: D1Database) {
  const body = await readBody(request);
  const pairingCode = String(body.code ?? "").trim();
  if (!/^\d{6}$/.test(pairingCode)) {
    return json({ error: "6자리 연결 코드를 입력해 주세요." }, 400);
  }

  const now = Date.now();
  const clientAddress =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const clientHash = await hash(clientAddress.split(",")[0].trim());
  const attempt = await db
    .prepare(
      "SELECT window_started_at, attempt_count FROM relay_pair_attempts WHERE client_hash = ?",
    )
    .bind(clientHash)
    .first<{ window_started_at: number; attempt_count: number }>();
  const inWindow = attempt && now - attempt.window_started_at < PAIR_WINDOW_MS;
  if (inWindow && attempt.attempt_count >= MAX_PAIR_ATTEMPTS) {
    return json(
      { error: "연결 시도가 너무 많습니다. 잠시 뒤 다시 시도해 주세요." },
      429,
    );
  }
  await db
    .prepare(
      `INSERT INTO relay_pair_attempts (client_hash, window_started_at, attempt_count)
       VALUES (?, ?, 1)
       ON CONFLICT(client_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN ? - relay_pair_attempts.window_started_at >= ?
           THEN ? ELSE relay_pair_attempts.window_started_at END,
         attempt_count = CASE
           WHEN ? - relay_pair_attempts.window_started_at >= ?
           THEN 1 ELSE relay_pair_attempts.attempt_count + 1 END`,
    )
    .bind(
      clientHash,
      now,
      now,
      PAIR_WINDOW_MS,
      now,
      now,
      PAIR_WINDOW_MS,
    )
    .run();

  const device = await db
    .prepare(
      `SELECT device_id, secret_hash, snapshot_json, last_seen_at
       FROM relay_devices
       WHERE pairing_code_hash = ? AND pairing_expires_at > ?
       ORDER BY last_seen_at DESC LIMIT 1`,
    )
    .bind(await hash(pairingCode), now)
    .first<DeviceRow>();

  if (!device) {
    return json(
      { error: "코드가 만료됐거나 PC Companion이 온라인이 아닙니다." },
      401,
    );
  }
  if (now - device.last_seen_at > ONLINE_WINDOW_MS) {
    return json(
      { error: "PC Companion이 오프라인입니다. PC에서 다시 실행해 주세요." },
      409,
    );
  }

  const token = randomToken();
  const expiresAt = now + BROWSER_SESSION_MS;
  await db
    .prepare(
      `INSERT INTO relay_browser_sessions
       (id, token_hash, device_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), await hash(token), device.device_id, expiresAt, now)
    .run();
  const cursorRow = await db
    .prepare(
      "SELECT COALESCE(MAX(id), 0) AS cursor FROM relay_events WHERE device_id = ?",
    )
    .bind(device.device_id)
    .first<{ cursor: number }>();

  return json({
    paired: true,
    token,
    transport: "cloud",
    expiresAt,
    eventCursor: cursorRow?.cursor ?? 0,
    companion: {
      ...safeJsonParse<Record<string, unknown>>(device.snapshot_json, {}),
      paired: true,
      connected: true,
      transport: "cloud",
    },
  });
}

async function updateSnapshot(request: Request, db: D1Database, device: DeviceRow) {
  const body = await readBody(request);
  const snapshot = body.snapshot ?? {};
  const now = Date.now();
  await db
    .prepare(
      `UPDATE relay_devices SET snapshot_json = ?, last_seen_at = ?, updated_at = ?
       WHERE device_id = ?`,
    )
    .bind(
      JSON.stringify(snapshot).slice(0, 100_000),
      now,
      now,
      device.device_id,
    )
    .run();
  return json({ saved: true, serverTime: now });
}

async function publishEvents(request: Request, db: D1Database, device: DeviceRow) {
  const body = await readBody(request);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length) {
    const now = Date.now();
    await db.batch(
      events.map((event) => {
        const payload =
          event && typeof event === "object"
            ? (event as Record<string, unknown>)
            : {};
        return db
          .prepare(
            `INSERT INTO relay_events (device_id, event_id, payload_json, created_at)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(
            device.device_id,
            String(payload.id ?? crypto.randomUUID()).slice(0, 100),
            JSON.stringify(payload).slice(0, 32_000),
            now,
          );
      }),
    );
  }
  return json({ saved: events.length });
}

async function claimCommands(db: D1Database, device: DeviceRow) {
  const rows = await db
    .prepare(
      `SELECT id, method, path, payload_json FROM relay_commands
       WHERE device_id = ? AND status = 'queued'
       ORDER BY created_at ASC LIMIT 10`,
    )
    .bind(device.device_id)
    .all<CommandRow>();
  const commands = rows.results ?? [];
  const now = Date.now();
  const claimed: CommandRow[] = [];
  for (const command of commands) {
    const result = await db
      .prepare(
        `UPDATE relay_commands SET status = 'claimed', claimed_at = ?
         WHERE id = ? AND device_id = ? AND status = 'queued'`,
      )
      .bind(now, command.id, device.device_id)
      .run();
    if ((result.meta.changes ?? 0) > 0) claimed.push(command);
  }
  await db
    .prepare(
      "UPDATE relay_devices SET last_seen_at = ?, updated_at = ? WHERE device_id = ?",
    )
    .bind(now, now, device.device_id)
    .run();
  return json({
    commands: claimed.map((command) => ({
      id: command.id,
      method: command.method,
      path: command.path,
      body: safeJsonParse(command.payload_json, {}),
    })),
  });
}

async function completeCommand(
  request: Request,
  db: D1Database,
  device: DeviceRow,
  commandId: string,
) {
  const body = await readBody(request);
  const ok = body.ok !== false;
  const now = Date.now();
  await db
    .prepare(
      `UPDATE relay_commands SET status = ?, result_json = ?, error_message = ?,
       completed_at = ? WHERE id = ? AND device_id = ? AND status = 'claimed'`,
    )
    .bind(
      ok ? "completed" : "failed",
      JSON.stringify(body.result ?? {}).slice(0, 32_000),
      ok ? null : String(body.error ?? "명령 실행 실패").slice(0, 1_000),
      now,
      commandId,
      device.device_id,
    )
    .run();
  return json({ saved: true });
}

async function browserSnapshot(db: D1Database, session: BrowserSessionRow) {
  const device = await db
    .prepare(
      "SELECT snapshot_json, last_seen_at FROM relay_devices WHERE device_id = ?",
    )
    .bind(session.device_id)
    .first<{ snapshot_json: string; last_seen_at: number }>();
  if (!device) return json({ error: "연결된 PC를 찾을 수 없습니다." }, 404);
  const online = Date.now() - device.last_seen_at <= ONLINE_WINDOW_MS;
  return json({
    ...safeJsonParse<Record<string, unknown>>(device.snapshot_json, {}),
    paired: true,
    connected: online,
    transport: "cloud",
    requiresPairing: false,
  });
}

async function browserSessions(db: D1Database, session: BrowserSessionRow) {
  const device = await db
    .prepare(
      "SELECT snapshot_json, last_seen_at FROM relay_devices WHERE device_id = ?",
    )
    .bind(session.device_id)
    .first<{ snapshot_json: string; last_seen_at: number }>();
  if (!device || Date.now() - device.last_seen_at > ONLINE_WINDOW_MS) {
    return json({ error: "PC Companion이 오프라인입니다." }, 503);
  }
  const snapshot = safeJsonParse<Record<string, unknown>>(
    device.snapshot_json,
    {},
  );
  return json({
    data: Array.isArray(snapshot.sessions) ? snapshot.sessions : [],
    nextCursor: null,
  });
}

async function browserEvents(
  request: Request,
  db: D1Database,
  session: BrowserSessionRow,
) {
  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const result = await db
    .prepare(
      `SELECT id, payload_json FROM relay_events
       WHERE device_id = ? AND id > ? ORDER BY id ASC LIMIT 100`,
    )
    .bind(session.device_id, after)
    .all<{ id: number; payload_json: string }>();
  const events = (result.results ?? []).map((row) => ({
    cursor: row.id,
    event: safeJsonParse(row.payload_json, {}),
  }));
  return json({ events, cursor: events.at(-1)?.cursor ?? after });
}

async function enqueueBrowserCommand(
  request: Request,
  db: D1Database,
  session: BrowserSessionRow,
  relayPath: string,
) {
  const device = await db
    .prepare("SELECT last_seen_at FROM relay_devices WHERE device_id = ?")
    .bind(session.device_id)
    .first<{ last_seen_at: number }>();
  if (!device || Date.now() - device.last_seen_at > ONLINE_WINDOW_MS) {
    return json({ error: "PC Companion이 오프라인입니다." }, 503);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" ? {} : await readBody(request);
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO relay_commands
       (id, device_id, method, path, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
    )
    .bind(
      id,
      session.device_id,
      method,
      relayPath,
      JSON.stringify(body),
      Date.now(),
    )
    .run();
  return json({ accepted: true, queued: true, commandId: id }, 202);
}

export async function handleRelayRequest(
  request: Request,
  env: RelayEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/relay/")) return null;
  if (!env?.DB) return json({ error: "클라우드 중계 저장소가 없습니다." }, 503);

  try {
    await ensureSchema(env.DB);

    if (request.method === "POST" && url.pathname === "/api/relay/pair") {
      return pairBrowser(request, env.DB);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/relay/device/register"
    ) {
      return registerDevice(request, env.DB);
    }

    if (url.pathname.startsWith("/api/relay/device/")) {
      const device = await authenticateDevice(request, env.DB);
      if (!device) return json({ error: "기기 인증에 실패했습니다." }, 401);
      if (
        request.method === "POST" &&
        url.pathname === "/api/relay/device/snapshot"
      ) {
        return updateSnapshot(request, env.DB, device);
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/relay/device/events"
      ) {
        return publishEvents(request, env.DB, device);
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/relay/device/commands"
      ) {
        return claimCommands(env.DB, device);
      }
      const completeMatch = url.pathname.match(
        /^\/api\/relay\/device\/commands\/([^/]+)\/complete$/,
      );
      if (request.method === "POST" && completeMatch) {
        return completeCommand(
          request,
          env.DB,
          device,
          decodeURIComponent(completeMatch[1]),
        );
      }
      return json({ error: "기기 중계 경로를 찾을 수 없습니다." }, 404);
    }

    const browserSession = await authenticateBrowser(request, env.DB);
    if (!browserSession) {
      return json(
        { error: "외부 연결 코드가 필요합니다.", requiresPairing: true },
        401,
      );
    }
    if (
      request.method === "GET" &&
      ["/api/relay/health", "/api/relay/snapshot"].includes(url.pathname)
    ) {
      return browserSnapshot(env.DB, browserSession);
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/relay/v2/sessions"
    ) {
      return browserSessions(env.DB, browserSession);
    }
    if (
      request.method === "GET" &&
      url.pathname === "/api/relay/events"
    ) {
      return browserEvents(request, env.DB, browserSession);
    }

    const relayPath = url.pathname.slice("/api/relay".length);
    const isAllowedCommand =
      request.method === "POST" &&
      (relayPath === "/v2/sessions" ||
        relayPath === "/simulate" ||
        /^\/v2\/sessions\/[^/]+\/(resume|turns|steer|interrupt)$/.test(
          relayPath,
        ) ||
        /^\/v2\/approvals\/[^/]+$/.test(relayPath));
    if (isAllowedCommand) {
      return enqueueBrowserCommand(
        request,
        env.DB,
        browserSession,
        relayPath,
      );
    }
    return json({ error: "클라우드 중계 경로를 찾을 수 없습니다." }, 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "클라우드 중계 요청을 처리하지 못했습니다.",
      },
      400,
    );
  }
}

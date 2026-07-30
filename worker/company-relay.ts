type CompanyRelayEnv = {
  DB: D1Database;
  APP_EDITION?: "service" | "public";
  COMPANY_CLI_ENDPOINT?: string;
  COMPANY_CLI_API_TOKEN?: string;
};

type BrowserSessionRow = {
  device_id: string;
  expires_at: number;
};

type QuotaRow = {
  window_started_at: number;
  attempt_count: number;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export const COMPANY_CLI_HOURLY_CAP_PER_DEVICE = 3;
export const COMPANY_CLI_DAILY_CAP_GLOBAL = 40;
export const COMPANY_CLI_QUEUE_MAX_DEPTH = 10;
export const COMPANY_CLI_JOB_TIMEOUT_MS = 180_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

let schemaReady: Promise<void> | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function bearer(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = db
      .batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS company_cli_quota_hourly (
          device_id TEXT PRIMARY KEY NOT NULL,
          window_started_at INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS company_cli_quota_daily (
          scope TEXT PRIMARY KEY NOT NULL,
          window_started_at INTEGER NOT NULL,
          attempt_count INTEGER NOT NULL DEFAULT 0
        )`),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

async function authenticateBrowser(request: Request, db: D1Database) {
  const token = bearer(request);
  if (!token) return null;
  const session = await db
    .prepare(
      `SELECT device_id, expires_at
       FROM relay_browser_sessions
       WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(await hash(token), Date.now())
    .first<BrowserSessionRow>();
  if (!session) return null;

  const requestedDevice = request.headers.get("x-agent-forest-device");
  if (requestedDevice && requestedDevice !== session.device_id) return null;
  return session;
}

export function evaluateQuotaWindow(
  row: QuotaRow | null,
  now: number,
  windowMs: number,
  cap: number,
) {
  const expired = !row || now - row.window_started_at >= windowMs;
  const windowStartedAt =
    expired ? now : row.window_started_at;
  const attemptCount = expired ? 0 : row.attempt_count;
  return {
    allowed: attemptCount < cap,
    windowStartedAt,
    attemptCount,
    retryAfterMs: Math.max(0, windowStartedAt + windowMs - now),
  };
}

async function consumeQuota(db: D1Database, deviceId: string) {
  const now = Date.now();
  const [hourlyRow, dailyRow] = await Promise.all([
    db
      .prepare(
        `SELECT window_started_at, attempt_count
         FROM company_cli_quota_hourly WHERE device_id = ?`,
      )
      .bind(deviceId)
      .first<QuotaRow>(),
    db
      .prepare(
        `SELECT window_started_at, attempt_count
         FROM company_cli_quota_daily WHERE scope = 'global'`,
      )
      .first<QuotaRow>(),
  ]);
  const hourly = evaluateQuotaWindow(
    hourlyRow,
    now,
    HOUR_MS,
    COMPANY_CLI_HOURLY_CAP_PER_DEVICE,
  );
  const daily = evaluateQuotaWindow(
    dailyRow,
    now,
    DAY_MS,
    COMPANY_CLI_DAILY_CAP_GLOBAL,
  );

  if (!hourly.allowed) {
    return {
      allowed: false as const,
      scope: "device-hourly",
      retryAfterMs: hourly.retryAfterMs,
    };
  }
  if (!daily.allowed) {
    return {
      allowed: false as const,
      scope: "global-daily",
      retryAfterMs: daily.retryAfterMs,
    };
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO company_cli_quota_hourly
          (device_id, window_started_at, attempt_count)
         VALUES (?, ?, 1)
         ON CONFLICT(device_id) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           attempt_count = CASE
             WHEN company_cli_quota_hourly.window_started_at = excluded.window_started_at
             THEN company_cli_quota_hourly.attempt_count + 1
             ELSE 1
           END`,
      )
      .bind(deviceId, hourly.windowStartedAt),
    db
      .prepare(
        `INSERT INTO company_cli_quota_daily
          (scope, window_started_at, attempt_count)
         VALUES ('global', ?, 1)
         ON CONFLICT(scope) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           attempt_count = CASE
             WHEN company_cli_quota_daily.window_started_at = excluded.window_started_at
             THEN company_cli_quota_daily.attempt_count + 1
             ELSE 1
           END`,
      )
      .bind(daily.windowStartedAt),
  ]);

  return {
    allowed: true as const,
    hourlyRemaining:
      COMPANY_CLI_HOURLY_CAP_PER_DEVICE - hourly.attemptCount - 1,
    dailyRemaining:
      COMPANY_CLI_DAILY_CAP_GLOBAL - daily.attemptCount - 1,
  };
}

function resolveEndpoint(env: CompanyRelayEnv) {
  if (!env.COMPANY_CLI_ENDPOINT || !env.COMPANY_CLI_API_TOKEN) return null;
  try {
    const endpoint = new URL(env.COMPANY_CLI_ENDPOINT);
    const localHttp =
      endpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !localHttp) return null;
    return endpoint;
  } catch {
    return null;
  }
}

async function readTaskBody(request: Request) {
  const text = await request.text();
  if (text.length > 64_000) throw new Error("업무 지시가 너무 깁니다.");
  const body = text
    ? (JSON.parse(text) as Record<string, unknown>)
    : ({} as Record<string, unknown>);
  const backend = String(body.backend ?? "");
  const prompt = String(body.prompt ?? "").trim();
  if (!["chatgpt-cli", "claude-cli"].includes(backend)) {
    throw new Error("지원하지 않는 회사 CLI 백엔드입니다.");
  }
  if (!prompt || prompt.length > 12_000) {
    throw new Error("1~12,000자의 업무 지시가 필요합니다.");
  }
  return { backend, prompt };
}

async function proxyUpstream(
  request: Request,
  endpoint: URL,
  token: string,
  deviceId: string,
) {
  const url = new URL(request.url);
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (request.method === "POST") {
    const task = await readTaskBody(request);
    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...task,
        device_id: deviceId,
        queue_max_depth: COMPANY_CLI_QUEUE_MAX_DEPTH,
      }),
      signal: AbortSignal.timeout(COMPANY_CLI_JOB_TIMEOUT_MS),
    });
  }

  const jobId = url.searchParams.get("job_id") ?? "";
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(jobId)) {
    return json({ error: "올바른 job_id가 필요합니다." }, 400);
  }
  const statusUrl = new URL(endpoint);
  statusUrl.pathname = `${statusUrl.pathname.replace(/\/$/, "")}/status`;
  statusUrl.searchParams.set("job_id", jobId);
  return fetch(statusUrl, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(COMPANY_CLI_JOB_TIMEOUT_MS),
  });
}

export async function handleCompanyCliRequest(
  request: Request,
  env: CompanyRelayEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isSubmit =
    request.method === "POST" &&
    url.pathname === "/api/relay/company-job";
  const isStatus =
    request.method === "GET" &&
    url.pathname === "/api/relay/company-job/status";
  if (!isSubmit && !isStatus) return null;

  if (env?.APP_EDITION !== "service") {
    return json({ error: "찾을 수 없는 경로입니다." }, 404);
  }
  if (!env.DB) return json({ error: "회사 CLI 저장소가 없습니다." }, 503);

  const endpoint = resolveEndpoint(env);
  if (!endpoint) {
    return json(
      {
        error: "회사 CLI 실행기가 아직 연결되지 않았습니다.",
        code: "company_runner_unavailable",
      },
      503,
    );
  }

  try {
    await ensureSchema(env.DB);
    const browserSession = await authenticateBrowser(request, env.DB);
    if (!browserSession) {
      return json(
        { error: "내 PC 연결 인증이 필요합니다.", requiresPairing: true },
        401,
      );
    }

    let quota:
      | Awaited<ReturnType<typeof consumeQuota>>
      | undefined;
    if (isSubmit) {
      quota = await consumeQuota(env.DB, browserSession.device_id);
      if (!quota.allowed) {
        return json(
          {
            error:
              quota.scope === "device-hourly"
                ? "이 기기의 시간당 회사 CLI 사용량을 모두 썼습니다."
                : "오늘의 회사 CLI 전체 사용량을 모두 썼습니다.",
            scope: quota.scope,
            retryAfterMs: quota.retryAfterMs,
          },
          429,
        );
      }
    }

    const upstream = await proxyUpstream(
      request,
      endpoint,
      env.COMPANY_CLI_API_TOKEN!,
      browserSession.device_id,
    );
    const responseText = await upstream.text();
    const responseHeaders = new Headers(JSON_HEADERS);
    responseHeaders.set(
      "X-Agent-Forest-Hourly-Remaining",
      String(quota?.allowed ? quota.hourlyRemaining : ""),
    );
    responseHeaders.set(
      "X-Agent-Forest-Daily-Remaining",
      String(quota?.allowed ? quota.dailyRemaining : ""),
    );
    return new Response(responseText, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return json(
      {
        error: timedOut
          ? "회사 CLI 작업이 제한 시간을 초과했습니다."
          : error instanceof Error
            ? error.message
            : "회사 CLI 요청을 처리하지 못했습니다.",
      },
      timedOut ? 504 : 400,
    );
  }
}

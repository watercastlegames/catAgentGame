type PlayerSyncEnv = {
  DB: D1Database;
};

type CatNeedInput = {
  hunger?: unknown;
  toilet?: unknown;
  happiness?: unknown;
  lastComputedAt?: unknown;
};

type ShellDeltaInput = {
  id?: unknown;
  amount?: unknown;
  reason?: unknown;
  appliedAt?: unknown;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const MAX_BODY_LENGTH = 128_000;
const MAX_NEEDS = 32;
const MAX_SHELL_DELTAS = 100;
const NEEDS_OFFLINE_CAP_MS = 12 * 60 * 60_000;
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";

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

function clampNeed(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(100, Math.max(0, parsed)));
}

function safeTimestamp(value: unknown, now = Date.now()) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return now;
  return Math.round(
    Math.min(now + 60_000, Math.max(now - NEEDS_OFFLINE_CAP_MS, parsed)),
  );
}

async function readBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_LENGTH) {
    throw new Error("동기화 요청 내용이 너무 큽니다.");
  }
  const text = await request.text();
  if (!text) return {};
  if (text.length > MAX_BODY_LENGTH) {
    throw new Error("동기화 요청 내용이 너무 큽니다.");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function decodeFullName(request: Request) {
  const encoded = request.headers.get(USER_FULL_NAME_HEADER);
  if (!encoded) return null;
  if (
    request.headers.get(USER_FULL_NAME_ENCODING_HEADER) !==
    PERCENT_ENCODED_UTF8
  ) {
    return encoded;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          google_sub TEXT,
          oai_user_email TEXT,
          email TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_login_at INTEGER NOT NULL
        )`),
        db.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub)",
        ),
        db.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS users_oai_email_idx ON users (oai_user_email)",
        ),
        db.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        db.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions (token_hash)",
        ),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id)",
        ),
        db.prepare(`CREATE TABLE IF NOT EXISTS player_shell_delta_log (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          reason TEXT NOT NULL,
          applied_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        db.prepare(
          "CREATE INDEX IF NOT EXISTS shell_delta_user_idx ON player_shell_delta_log (user_id, applied_at)",
        ),
        db.prepare(`CREATE TABLE IF NOT EXISTS cat_need_state (
          user_id TEXT NOT NULL,
          cat_thread_id TEXT NOT NULL,
          hunger INTEGER NOT NULL DEFAULT 0,
          toilet INTEGER NOT NULL DEFAULT 0,
          happiness INTEGER NOT NULL DEFAULT 30,
          last_computed_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        db.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS cat_need_state_user_thread_idx ON cat_need_state (user_id, cat_thread_id)",
        ),
        db.prepare(`CREATE TABLE IF NOT EXISTS workstation_decor_state (
          user_id TEXT PRIMARY KEY NOT NULL,
          owned_item_ids_json TEXT NOT NULL DEFAULT '[]',
          seats_json TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
      ]);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

async function authenticateUser(request: Request, db: D1Database) {
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase();
  if (!email || email.length > 320) return null;
  const id = `oai_${(await hash(email)).slice(0, 32)}`;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users
       (id, oai_user_email, email, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         oai_user_email = excluded.oai_user_email,
         email = excluded.email,
         last_login_at = excluded.last_login_at`,
    )
    .bind(id, email, email, now, now)
    .run();
  return {
    id,
    email,
    displayName: decodeFullName(request) ?? email,
  };
}

async function readState(db: D1Database, userId: string) {
  const [shellRow, needsResult, decorRow] = await Promise.all([
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS balance FROM player_shell_delta_log WHERE user_id = ?",
      )
      .bind(userId)
      .first<{ balance: number }>(),
    db
      .prepare(
        `SELECT cat_thread_id, hunger, toilet, happiness, last_computed_at
         FROM cat_need_state
         WHERE user_id = ?
         ORDER BY cat_thread_id`,
      )
      .bind(userId)
      .all<{
        cat_thread_id: string;
        hunger: number;
        toilet: number;
        happiness: number;
        last_computed_at: number;
      }>(),
    db
      .prepare(
        `SELECT owned_item_ids_json, seats_json, updated_at
         FROM workstation_decor_state
         WHERE user_id = ?`,
      )
      .bind(userId)
      .first<{
        owned_item_ids_json: string;
        seats_json: string;
        updated_at: number;
      }>(),
  ]);
  const catNeeds = Object.fromEntries(
    (needsResult.results ?? []).map((row) => [
      row.cat_thread_id,
      {
        hunger: row.hunger,
        toilet: row.toilet,
        happiness: row.happiness,
        lastComputedAt: row.last_computed_at,
      },
    ]),
  );
  let decor: {
    ownedItemIds: unknown[];
    seats: Record<string, unknown>;
    updatedAt: number;
  } | null = null;
  if (decorRow) {
    try {
      const ownedItemIds = JSON.parse(decorRow.owned_item_ids_json);
      const seats = JSON.parse(decorRow.seats_json);
      decor = {
        ownedItemIds: Array.isArray(ownedItemIds) ? ownedItemIds : [],
        seats:
          seats && typeof seats === "object"
            ? (seats as Record<string, unknown>)
            : {},
        updatedAt: decorRow.updated_at,
      };
    } catch {
      decor = { ownedItemIds: [], seats: {}, updatedAt: decorRow.updated_at };
    }
  }
  return {
    shellBalance: Number(shellRow?.balance ?? 0),
    catNeeds,
    decor,
  };
}

async function pushState(
  request: Request,
  db: D1Database,
  userId: string,
) {
  const body = await readBody(request);
  const now = Date.now();
  const shellDeltas = Array.isArray(body.shellDeltas)
    ? (body.shellDeltas as ShellDeltaInput[]).slice(0, MAX_SHELL_DELTAS)
    : [];
  const catNeeds =
    body.catNeeds && typeof body.catNeeds === "object"
      ? Object.entries(body.catNeeds as Record<string, CatNeedInput>).slice(
          0,
          MAX_NEEDS,
        )
      : [];
  const statements: D1PreparedStatement[] = [];

  for (const delta of shellDeltas) {
    const id = typeof delta.id === "string" ? delta.id.slice(0, 100) : "";
    const amount = Math.round(Number(delta.amount));
    if (!id || !Number.isFinite(amount) || amount === 0) continue;
    const reason =
      typeof delta.reason === "string"
        ? delta.reason.slice(0, 80)
        : "client-sync";
    statements.push(
      db
        .prepare(
          `INSERT INTO player_shell_delta_log
           (id, user_id, amount, reason, applied_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(id, userId, amount, reason, safeTimestamp(delta.appliedAt, now)),
    );
  }

  for (const [threadId, state] of catNeeds) {
    if (!threadId || threadId.length > 200 || !state) continue;
    const lastComputedAt = safeTimestamp(state.lastComputedAt, now);
    statements.push(
      db
        .prepare(
          `INSERT INTO cat_need_state
           (user_id, cat_thread_id, hunger, toilet, happiness, last_computed_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, cat_thread_id) DO UPDATE SET
             hunger = excluded.hunger,
             toilet = excluded.toilet,
             happiness = excluded.happiness,
             last_computed_at = excluded.last_computed_at
           WHERE excluded.last_computed_at >= cat_need_state.last_computed_at`,
        )
        .bind(
          userId,
          threadId,
          clampNeed(state.hunger, 0),
          clampNeed(state.toilet, 0),
          clampNeed(state.happiness, 30),
          lastComputedAt,
        ),
    );
  }

  const decor =
    body.decor && typeof body.decor === "object"
      ? (body.decor as Record<string, unknown>)
      : null;
  if (decor) {
    const ownedItemIds = Array.isArray(decor.ownedItemIds)
      ? decor.ownedItemIds
          .filter((item): item is string => typeof item === "string")
          .slice(0, 100)
      : [];
    const seats =
      decor.seats && typeof decor.seats === "object" ? decor.seats : {};
    const updatedAt = safeTimestamp(decor.updatedAt, now);
    statements.push(
      db
        .prepare(
          `INSERT INTO workstation_decor_state
           (user_id, owned_item_ids_json, seats_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             owned_item_ids_json = excluded.owned_item_ids_json,
             seats_json = excluded.seats_json,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at >= workstation_decor_state.updated_at`,
        )
        .bind(
          userId,
          JSON.stringify(ownedItemIds),
          JSON.stringify(seats),
          updatedAt,
        ),
    );
  }

  if (statements.length) await db.batch(statements);
  return readState(db, userId);
}

export async function handlePlayerSyncRequest(
  request: Request,
  env: PlayerSyncEnv | undefined,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/sync/")) return null;
  if (!env?.DB) return json({ error: "동기화 저장소가 없습니다." }, 503);

  try {
    await ensureSchema(env.DB);
    const user = await authenticateUser(request, env.DB);
    if (!user) {
      return json(
        {
          error: "호스팅 계정 인증이 필요합니다.",
          authenticated: false,
        },
        401,
      );
    }

    if (
      request.method === "GET" &&
      ["/api/sync/bootstrap", "/api/sync/pull"].includes(url.pathname)
    ) {
      return json({
        authenticated: true,
        user: { displayName: user.displayName, email: user.email },
        state: await readState(env.DB, user.id),
        serverTime: Date.now(),
      });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/sync/push"
    ) {
      return json({
        authenticated: true,
        state: await pushState(request, env.DB, user.id),
        serverTime: Date.now(),
      });
    }
    return json({ error: "동기화 경로를 찾을 수 없습니다." }, 404);
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "플레이어 상태를 동기화하지 못했습니다.",
      },
      400,
    );
  }
}

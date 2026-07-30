export const SNACK_LOG_KEY = "agent-forest-snack-log-v1";
export const SNACK_PRICE = 6;
export const SNACK_COOLDOWN_MS = 60_000;
export const SNACK_DAILY_CAP_PER_CAT = 8;
export const SNACK_EATING_SECONDS = 2.8;
export const SNACK_MIN_APPROACH_TIMEOUT_SECONDS = 12;
export const SNACK_MAX_APPROACH_TIMEOUT_SECONDS = 45;
export const PLAY_LOG_KEY = "agent-forest-play-log-v1";
export const PLAY_COOLDOWN_MS = 60_000;
export const PLAY_DAILY_CAP_PER_CAT = 6;
export const LASER_DURATION_MS = 20_000;
export const PETTING_LOG_KEY = "agent-forest-petting-log-v1";
export const PETTING_COOLDOWN_MS = 10 * 60_000;
export const PETTING_HAPPINESS_GAIN = 3;

export type CatInteractionCounter = {
  date: string;
  count: number;
  lastCompletedAt: number;
};

export type CatInteractionLog = Record<string, CatInteractionCounter>;
export type PlayKind = "laser" | "toy";
export type CatPlayLog = Record<
  string,
  Partial<Record<PlayKind, CatInteractionCounter>>
>;
export type PettingLog = Record<string, number>;

function localDateStamp(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseSnackLog(
  raw: string | null,
  now = new Date(),
): CatInteractionLog {
  if (!raw) return {};
  const today = localDateStamp(now);
  try {
    const parsed = JSON.parse(raw) as CatInteractionLog;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([catId, value]) => catId && value && typeof value === "object")
        .map(([catId, value]) => [
          catId,
          value.date === today
            ? {
                date: today,
                count: Math.min(
                  SNACK_DAILY_CAP_PER_CAT,
                  Math.max(0, Math.trunc(Number(value.count) || 0)),
                ),
                lastCompletedAt: Math.max(
                  0,
                  Number(value.lastCompletedAt) || 0,
                ),
              }
            : { date: today, count: 0, lastCompletedAt: 0 },
        ]),
    );
  } catch {
    return {};
  }
}

export function snackAvailability(
  log: CatInteractionLog,
  catId: string,
  now = Date.now(),
): { available: boolean; reason: "ready" | "cooldown" | "daily-cap"; waitMs: number } {
  const today = localDateStamp(new Date(now));
  const current =
    log[catId]?.date === today
      ? log[catId]
      : { date: today, count: 0, lastCompletedAt: 0 };
  if (current.count >= SNACK_DAILY_CAP_PER_CAT) {
    return { available: false, reason: "daily-cap", waitMs: 0 };
  }
  const waitMs = Math.max(
    0,
    SNACK_COOLDOWN_MS - (now - current.lastCompletedAt),
  );
  return {
    available: waitMs <= 0,
    reason: waitMs > 0 ? "cooldown" : "ready",
    waitMs,
  };
}

export function snackHappinessGain(nextCount: number) {
  if (nextCount <= 3) return 5;
  if (nextCount <= 6) return 3;
  return 1;
}

export function snackApproachTimeoutSeconds(
  distance: number,
  moveSpeed: number,
) {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const safeMoveSpeed =
    Number.isFinite(moveSpeed) && moveSpeed > 0 ? moveSpeed : 0.1;
  const estimatedTravelSeconds = safeDistance / safeMoveSpeed;
  return Math.min(
    SNACK_MAX_APPROACH_TIMEOUT_SECONDS,
    Math.max(
      SNACK_MIN_APPROACH_TIMEOUT_SECONDS,
      estimatedTravelSeconds * 2.2 + 4,
    ),
  );
}

export function completeSnack(
  log: CatInteractionLog,
  catId: string,
  now = Date.now(),
): {
  log: CatInteractionLog;
  happinessGain: number;
  count: number;
} {
  const today = localDateStamp(new Date(now));
  const current =
    log[catId]?.date === today
      ? log[catId]
      : { date: today, count: 0, lastCompletedAt: 0 };
  const count = Math.min(SNACK_DAILY_CAP_PER_CAT, current.count + 1);
  return {
    log: {
      ...log,
      [catId]: {
        date: today,
        count,
        lastCompletedAt: now,
      },
    },
    happinessGain: snackHappinessGain(count),
    count,
  };
}

export function parsePlayLog(
  raw: string | null,
  now = new Date(),
): CatPlayLog {
  if (!raw) return {};
  const today = localDateStamp(now);
  try {
    const parsed = JSON.parse(raw) as CatPlayLog;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([catId, kinds]) => [
        catId,
        Object.fromEntries(
          (["laser", "toy"] as PlayKind[]).flatMap((kind) => {
            const value = kinds?.[kind];
            if (!value) return [];
            return [
              [
                kind,
                value.date === today
                  ? {
                      date: today,
                      count: Math.min(
                        PLAY_DAILY_CAP_PER_CAT,
                        Math.max(0, Math.trunc(Number(value.count) || 0)),
                      ),
                      lastCompletedAt: Math.max(
                        0,
                        Number(value.lastCompletedAt) || 0,
                      ),
                    }
                  : { date: today, count: 0, lastCompletedAt: 0 },
              ],
            ];
          }),
        ),
      ]),
    );
  } catch {
    return {};
  }
}

export function parsePettingLog(raw: string | null): PettingLog {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([catId, value]) =>
            Boolean(catId) && Number.isFinite(value) && Number(value) >= 0,
        )
        .map(([catId, value]) => [catId, Number(value)]),
    );
  } catch {
    return {};
  }
}

export function completePetting(
  log: PettingLog,
  catId: string,
  now = Date.now(),
): {
  accepted: boolean;
  log: PettingLog;
  happinessGain: number;
  waitMs: number;
} {
  const lastCompletedAt = Math.max(0, Number(log[catId]) || 0);
  const waitMs = Math.max(
    0,
    PETTING_COOLDOWN_MS - (now - lastCompletedAt),
  );
  if (lastCompletedAt > 0 && waitMs > 0) {
    return { accepted: false, log, happinessGain: 0, waitMs };
  }
  return {
    accepted: true,
    log: { ...log, [catId]: now },
    happinessGain: PETTING_HAPPINESS_GAIN,
    waitMs: 0,
  };
}

export function playAvailability(
  log: CatPlayLog,
  catId: string,
  kind: PlayKind,
  now = Date.now(),
) {
  const today = localDateStamp(new Date(now));
  const current =
    log[catId]?.[kind]?.date === today
      ? log[catId][kind]
      : { date: today, count: 0, lastCompletedAt: 0 };
  if (!current || current.count >= PLAY_DAILY_CAP_PER_CAT) {
    return { available: false, reason: "daily-cap" as const, waitMs: 0 };
  }
  const waitMs = Math.max(
    0,
    PLAY_COOLDOWN_MS - (now - current.lastCompletedAt),
  );
  return {
    available: waitMs <= 0,
    reason: waitMs > 0 ? ("cooldown" as const) : ("ready" as const),
    waitMs,
  };
}

export function playHappinessGain(kind: PlayKind, nextCount: number) {
  if (kind === "laser") {
    if (nextCount <= 2) return 3;
    if (nextCount <= 4) return 2;
    return 1;
  }
  if (nextCount <= 2) return 5;
  if (nextCount <= 4) return 3;
  return 1;
}

export function completePlay(
  log: CatPlayLog,
  catId: string,
  kind: PlayKind,
  now = Date.now(),
) {
  const today = localDateStamp(new Date(now));
  const current =
    log[catId]?.[kind]?.date === today
      ? log[catId][kind]
      : { date: today, count: 0, lastCompletedAt: 0 };
  const count = Math.min(PLAY_DAILY_CAP_PER_CAT, (current?.count ?? 0) + 1);
  return {
    log: {
      ...log,
      [catId]: {
        ...log[catId],
        [kind]: {
          date: today,
          count,
          lastCompletedAt: now,
        },
      },
    },
    happinessGain: playHappinessGain(kind, count),
    count,
  };
}

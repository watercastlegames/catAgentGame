export const NEEDS_KEY = "agent-forest-cat-needs-v1";

export const NEED_MIN = 0;
export const NEED_MAX = 100;
export const NEED_WARNING_THRESHOLD = 60;
export const NEED_DANGER_THRESHOLD = 85;
export const NEED_FORCE_THRESHOLD = 100;
export const NEEDS_OFFLINE_CAP_MS = 12 * 60 * 60 * 1_000;
export const HUNGER_FILL_MS = 45 * 60 * 1_000;
export const TOILET_FILL_MS = 90 * 60 * 1_000;
export const CAT_CARE_SEEK_THRESHOLD = NEED_DANGER_THRESHOLD;
export const EMPTY_BOWL_HAPPINESS_LOSS = 6;
export const FULL_LITTER_BOX_HAPPINESS_LOSS = 8;
export const MEAL_HAPPINESS_GAIN = 4;
export const TOILET_HAPPINESS_GAIN = 2;

export type CatCareIntent = "food" | "toilet";
export type CatCareOutcome =
  | "meal-completed"
  | "meal-missed"
  | "toilet-completed"
  | "toilet-blocked";

export type CatNeedState = {
  hunger: number;
  toilet: number;
  happiness: number;
  lastComputedAt: number;
};

export type CatNeedsStore = Record<string, CatNeedState>;

export type HappinessBand = "sulky" | "neutral" | "good" | "best";

export type HappinessMotionProfile = {
  ambientSpeedMultiplier: number;
  prewalkingWaitMultiplier: number;
  kneadingStopThreshold: number;
};

export const HAPPINESS_MOTION_PROFILES: Record<
  HappinessBand,
  HappinessMotionProfile
> = {
  sulky: {
    ambientSpeedMultiplier: 0.7,
    prewalkingWaitMultiplier: 1.8,
    kneadingStopThreshold: 4,
  },
  neutral: {
    ambientSpeedMultiplier: 1,
    prewalkingWaitMultiplier: 1,
    kneadingStopThreshold: 2,
  },
  good: {
    ambientSpeedMultiplier: 1,
    prewalkingWaitMultiplier: 1,
    kneadingStopThreshold: 2,
  },
  best: {
    ambientSpeedMultiplier: 1.1,
    prewalkingWaitMultiplier: 0.6,
    kneadingStopThreshold: 1,
  },
};

export function clampNeed(value: number, fallback = 0) {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.min(NEED_MAX, Math.max(NEED_MIN, safeValue));
}

export function createDefaultCatNeedState(now = Date.now()): CatNeedState {
  return {
    hunger: 0,
    toilet: 0,
    happiness: 30,
    lastComputedAt: now,
  };
}

export function computeCurrentValue(
  value: number,
  lastComputedAt: number,
  fillDurationMs: number,
  now = Date.now(),
) {
  const elapsed = Math.min(
    NEEDS_OFFLINE_CAP_MS,
    Math.max(0, now - lastComputedAt),
  );
  return clampNeed(value + (elapsed / fillDurationMs) * NEED_MAX);
}

export function computeCatNeedState(
  state: CatNeedState,
  now = Date.now(),
): CatNeedState {
  const lastComputedAt = Number.isFinite(state.lastComputedAt)
    ? Math.min(now, Math.max(0, state.lastComputedAt))
    : now;
  return {
    hunger: computeCurrentValue(
      state.hunger,
      lastComputedAt,
      HUNGER_FILL_MS,
      now,
    ),
    toilet: computeCurrentValue(
      state.toilet,
      lastComputedAt,
      TOILET_FILL_MS,
      now,
    ),
    // 행복도는 시간 경과가 아니라 사건으로만 변한다.
    happiness: clampNeed(state.happiness, 30),
    lastComputedAt: now,
  };
}

export function getHappinessBand(happiness: number): HappinessBand {
  const value = clampNeed(happiness, 30);
  if (value < 25) return "sulky";
  if (value < 50) return "neutral";
  if (value < 80) return "good";
  return "best";
}

export function getNeedTone(
  value: number,
): "normal" | "warning" | "danger" | "forced" {
  const safeValue = clampNeed(value);
  if (safeValue >= NEED_FORCE_THRESHOLD) return "forced";
  if (safeValue >= NEED_DANGER_THRESHOLD) return "danger";
  if (safeValue >= NEED_WARNING_THRESHOLD) return "warning";
  return "normal";
}

export function selectCatCareIntent(
  state: Pick<CatNeedState, "hunger" | "toilet">,
): CatCareIntent | null {
  const hunger = clampNeed(state.hunger);
  const toilet = clampNeed(state.toilet);
  if (
    hunger < CAT_CARE_SEEK_THRESHOLD &&
    toilet < CAT_CARE_SEEK_THRESHOLD
  ) {
    return null;
  }
  return hunger >= toilet ? "food" : "toilet";
}

export function updateCatNeedState(
  state: CatNeedState,
  patch: Partial<Pick<CatNeedState, "hunger" | "toilet" | "happiness">>,
  now = Date.now(),
): CatNeedState {
  const current = computeCatNeedState(state, now);
  return {
    hunger: clampNeed(patch.hunger ?? current.hunger),
    toilet: clampNeed(patch.toilet ?? current.toilet),
    happiness: clampNeed(patch.happiness ?? current.happiness, 30),
    lastComputedAt: now,
  };
}

export function applyCatCareOutcome(
  state: CatNeedState,
  outcome: CatCareOutcome,
  now = Date.now(),
): CatNeedState {
  const current = computeCatNeedState(state, now);
  if (outcome === "meal-completed") {
    return updateCatNeedState(
      current,
      {
        hunger: 0,
        happiness: current.happiness + MEAL_HAPPINESS_GAIN,
      },
      now,
    );
  }
  if (outcome === "meal-missed") {
    return updateCatNeedState(
      current,
      {
        happiness: current.happiness - EMPTY_BOWL_HAPPINESS_LOSS,
      },
      now,
    );
  }
  if (outcome === "toilet-blocked") {
    return updateCatNeedState(
      current,
      {
        happiness: current.happiness - FULL_LITTER_BOX_HAPPINESS_LOSS,
      },
      now,
    );
  }
  return updateCatNeedState(
    current,
    {
      toilet: 0,
      happiness: current.happiness + TOILET_HAPPINESS_GAIN,
    },
    now,
  );
}

export function parseCatNeedsStore(
  raw: string | null,
  now = Date.now(),
): CatNeedsStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<CatNeedState>>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([threadId, state]) => threadId && state && typeof state === "object")
        .map(([threadId, state]) => [
          threadId,
          computeCatNeedState(
            {
              hunger: clampNeed(Number(state.hunger)),
              toilet: clampNeed(Number(state.toilet)),
              happiness: clampNeed(Number(state.happiness), 30),
              lastComputedAt: Number(state.lastComputedAt) || now,
            },
            now,
          ),
        ]),
    );
  } catch {
    return {};
  }
}

export function ensureCatNeedState(
  store: CatNeedsStore,
  threadId: string,
  now = Date.now(),
) {
  return store[threadId]
    ? computeCatNeedState(store[threadId], now)
    : createDefaultCatNeedState(now);
}

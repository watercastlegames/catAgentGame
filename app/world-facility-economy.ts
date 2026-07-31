export const WORLD_FACILITY_STORAGE_KEY =
  "agent-forest-world-facilities-v1";
export const WORLD_FACILITY_VERSION = 1;

export const CAT_EXERCISE_WHEEL_ID = "cat-exercise-wheel";
export const CAT_EXERCISE_WHEEL_PRICE = 120;
export const CAT_EXERCISE_WHEEL_PREVIEW_URL =
  "/art/world-facilities-v1/cat-exercise-wheel-card-v1.png";

export type WorldFacilityId = typeof CAT_EXERCISE_WHEEL_ID;

export type WorldFacilityState = {
  version: 1;
  owned: WorldFacilityId[];
};

const KNOWN_WORLD_FACILITY_IDS = new Set<string>([
  CAT_EXERCISE_WHEEL_ID,
]);

export function createDefaultWorldFacilityState(): WorldFacilityState {
  return { version: WORLD_FACILITY_VERSION, owned: [] };
}
export function parseWorldFacilityState(
  raw: string | null | undefined,
): WorldFacilityState {
  if (!raw) return createDefaultWorldFacilityState();

  try {
    const parsed = JSON.parse(raw) as Partial<WorldFacilityState>;
    return {
      version: WORLD_FACILITY_VERSION,
      owned: Array.from(
        new Set(
          Array.isArray(parsed.owned)
            ? parsed.owned.filter(
                (itemId): itemId is WorldFacilityId =>
                  typeof itemId === "string" &&
                  KNOWN_WORLD_FACILITY_IDS.has(itemId),
              )
            : [],
        ),
      ),
    };
  } catch {
    return createDefaultWorldFacilityState();
  }
}

export function purchaseCatExerciseWheel(
  shells: number,
  state: WorldFacilityState,
) {
  const balance = Math.max(0, Math.trunc(Number(shells) || 0));
  if (state.owned.includes(CAT_EXERCISE_WHEEL_ID)) {
    return {
      ok: true as const,
      balance,
      charged: 0,
      state,
    };
  }
  if (balance < CAT_EXERCISE_WHEEL_PRICE) {
    return {
      ok: false as const,
      balance,
      charged: 0,
      required: CAT_EXERCISE_WHEEL_PRICE,
      state,
    };
  }

  return {
    ok: true as const,
    balance: balance - CAT_EXERCISE_WHEEL_PRICE,
    charged: CAT_EXERCISE_WHEEL_PRICE,
    state: {
      version: WORLD_FACILITY_VERSION,
      owned: [...state.owned, CAT_EXERCISE_WHEEL_ID],
    } satisfies WorldFacilityState,
  };
}

export const FOOD_BOWL_KEY = "agent-forest-food-bowl-v1";
export const FOOD_PORTIONS_PER_FILL = 4;

export type FoodGrade = "Basic" | "Advanced" | "Premium";

export type FoodBowlState = {
  grade: FoodGrade | null;
  portionsRemaining: number;
};

export type FoodProfile = {
  grade: FoodGrade;
  label: string;
  buttonLabel: string;
  price: number;
  portions: number;
  satiationMinutes: number;
  happinessGain: number;
  tint: number;
};

export const FOOD_PROFILES: Record<FoodGrade, FoodProfile> = {
  Basic: {
    grade: "Basic",
    label: "기본 사료",
    buttonLabel: "사료 주기",
    price: 12,
    portions: FOOD_PORTIONS_PER_FILL,
    satiationMinutes: 45,
    happinessGain: 4,
    tint: 0xffffff,
  },
  Advanced: {
    grade: "Advanced",
    label: "고급 사료",
    buttonLabel: "고급 사료 주기",
    price: 28,
    portions: FOOD_PORTIONS_PER_FILL,
    satiationMinutes: 120,
    happinessGain: 6,
    tint: 0xffd9a0,
  },
  Premium: {
    grade: "Premium",
    label: "프리미엄 사료",
    buttonLabel: "프리미엄 사료 주기",
    price: 55,
    portions: FOOD_PORTIONS_PER_FILL,
    satiationMinutes: 240,
    happinessGain: 9,
    tint: 0xf4c542,
  },
};

export function createDefaultFoodBowlState(): FoodBowlState {
  return { grade: "Basic", portionsRemaining: FOOD_PORTIONS_PER_FILL };
}

export function createEmptyFoodBowlState(): FoodBowlState {
  return { grade: null, portionsRemaining: 0 };
}

export function parseFoodBowlState(raw: string | null): FoodBowlState {
  if (raw === null || raw === "full") return createDefaultFoodBowlState();
  if (raw === "empty") return createEmptyFoodBowlState();

  try {
    const parsed = JSON.parse(raw) as Partial<FoodBowlState>;
    const grade =
      parsed.grade === "Basic" ||
      parsed.grade === "Advanced" ||
      parsed.grade === "Premium"
        ? parsed.grade
        : null;
    const portions = Math.min(
      FOOD_PORTIONS_PER_FILL,
      Math.max(0, Math.trunc(Number(parsed.portionsRemaining) || 0)),
    );
    return grade && portions > 0
      ? { grade, portionsRemaining: portions }
      : createEmptyFoodBowlState();
  } catch {
    return createDefaultFoodBowlState();
  }
}

export function fillFoodBowl(grade: FoodGrade): FoodBowlState {
  return {
    grade,
    portionsRemaining: FOOD_PROFILES[grade].portions,
  };
}

export function consumeFoodPortion(state: FoodBowlState): FoodBowlState {
  const remaining = Math.max(0, state.portionsRemaining - 1);
  return remaining > 0 && state.grade
    ? { grade: state.grade, portionsRemaining: remaining }
    : createEmptyFoodBowlState();
}

export function serializeFoodBowlState(state: FoodBowlState) {
  return JSON.stringify(state);
}

export const FOOD_BOWL_COUNT_STORAGE_KEY =
  "agent-forest-food-bowl-count-v1";
export const FOOD_BOWL_2_PRICE = 60;
export const MAX_OWNED_FOOD_BOWL_COUNT = 2;

export type OwnedFoodBowlCount = 1 | 2;

export function parseOwnedFoodBowlCount(
  raw: string | null | undefined,
): OwnedFoodBowlCount {
  return Number(raw) >= MAX_OWNED_FOOD_BOWL_COUNT ? 2 : 1;
}

export function purchaseSecondFoodBowl(
  balance: number,
  currentCount: OwnedFoodBowlCount,
) {
  const safeBalance = Math.max(0, Math.trunc(Number(balance) || 0));
  if (currentCount >= MAX_OWNED_FOOD_BOWL_COUNT) {
    return {
      ok: true as const,
      balance: safeBalance,
      count: 2 as const,
      charged: 0,
    };
  }
  if (safeBalance < FOOD_BOWL_2_PRICE) {
    return {
      ok: false as const,
      balance: safeBalance,
      count: currentCount,
      charged: 0,
      required: FOOD_BOWL_2_PRICE,
    };
  }

  return {
    ok: true as const,
    balance: safeBalance - FOOD_BOWL_2_PRICE,
    count: 2 as const,
    charged: FOOD_BOWL_2_PRICE,
  };
}

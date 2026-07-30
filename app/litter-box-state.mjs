export const LITTER_BOX_STORAGE_KEY = "agent-forest-litter-box-v1";
export const LITTER_TIER_STORAGE_KEY = "agent-forest-litter-tier-v1";
export const LITTER_BOX_MAX_LEVEL = 100;
export const LITTER_BOX_WASTE_PER_USE = 34;
export const LITTER_TIER_CAPACITY = Object.freeze({
  1: 100,
  2: 200,
  3: 300,
});
export const LITTER_TIER_PRICE = Object.freeze({
  2: 60,
  3: 150,
});

export function parseLitterTier(raw) {
  const tier = Math.trunc(Number(raw));
  return tier === 2 || tier === 3 ? tier : 1;
}

export function litterCapacityForTier(tier) {
  return LITTER_TIER_CAPACITY[parseLitterTier(tier)];
}

export function clampLitterLevel(value, maxLevel = LITTER_BOX_MAX_LEVEL) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const safeMax = Math.max(1, Number(maxLevel) || LITTER_BOX_MAX_LEVEL);
  return Math.min(safeMax, Math.max(0, numeric));
}

export function parseLitterLevel(raw, maxLevel = LITTER_BOX_MAX_LEVEL) {
  if (raw === null || raw === undefined || raw === "") return 0;
  return clampLitterLevel(raw, maxLevel);
}

export function addLitterWaste(
  level,
  amount = LITTER_BOX_WASTE_PER_USE,
  maxLevel = LITTER_BOX_MAX_LEVEL,
) {
  return clampLitterLevel(
    clampLitterLevel(level, maxLevel) + Math.max(0, amount),
    maxLevel,
  );
}

export function isLitterBoxFull(level, maxLevel = LITTER_BOX_MAX_LEVEL) {
  return clampLitterLevel(level, maxLevel) >= maxLevel;
}

export function cleanLitterBox() {
  return 0;
}

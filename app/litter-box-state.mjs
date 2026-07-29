export const LITTER_BOX_STORAGE_KEY = "agent-forest-litter-box-v1";
export const LITTER_BOX_MAX_LEVEL = 100;
export const LITTER_BOX_WASTE_PER_USE = 34;

export function clampLitterLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(LITTER_BOX_MAX_LEVEL, Math.max(0, numeric));
}

export function parseLitterLevel(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  return clampLitterLevel(raw);
}

export function addLitterWaste(
  level,
  amount = LITTER_BOX_WASTE_PER_USE,
) {
  return clampLitterLevel(clampLitterLevel(level) + Math.max(0, amount));
}

export function isLitterBoxFull(level) {
  return clampLitterLevel(level) >= LITTER_BOX_MAX_LEVEL;
}

export function cleanLitterBox() {
  return 0;
}

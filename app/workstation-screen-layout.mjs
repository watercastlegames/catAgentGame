export const WORKSTATION_SCREEN_LAYOUT_STORAGE_KEY =
  "agent-forest-workstation-screen-layout-v1";

const SEAT_IDS = new Set(["seat-1", "seat-2", "seat-3", "seat-4"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseWorkstationScreenLayout(raw) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([seatId, value]) => {
        if (
          !SEAT_IDS.has(seatId) ||
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !isFiniteNumber(value.x) ||
          !isFiniteNumber(value.y) ||
          !isFiniteNumber(value.z) ||
          !isFiniteNumber(value.width) ||
          !isFiniteNumber(value.height) ||
          !isFiniteNumber(value.rotationX) ||
          value.width <= 0 ||
          value.height <= 0
        ) {
          return [];
        }

        return [[seatId, { ...value }]];
      }),
    );
  } catch {
    return {};
  }
}

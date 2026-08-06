const RESIDENT_CATS = Object.freeze({
  "seat-1": Object.freeze({
    id: "agent-forest-demo-cat",
    name: "코치 모모",
  }),
  "seat-2": Object.freeze({
    id: "agent-forest-resident-seat-2",
    name: "두부",
  }),
  "seat-3": Object.freeze({
    id: "agent-forest-resident-seat-3",
    name: "콩이",
  }),
  "seat-4": Object.freeze({
    id: "agent-forest-resident-seat-4",
    name: "모카",
  }),
});

export const RESIDENT_CAT_NAME_POOL = Object.freeze([
  "나비",
  "두부",
  "콩이",
  "모카",
  "호두",
  "감자",
  "만두",
  "몽실이",
  "방울이",
  "보리",
  "초코",
  "구름이",
  "마루",
  "우유",
  "라떼",
  "참치",
]);

export function createRandomResidentCatName(
  existingNames = [],
  random = Math.random,
) {
  const usedNames = new Set(
    existingNames
      .filter((name) => typeof name === "string")
      .map((name) => name.trim())
      .filter(Boolean),
  );
  const unusedNames = RESIDENT_CAT_NAME_POOL.filter(
    (name) => !usedNames.has(name),
  );
  const candidates = unusedNames.length > 0 ? unusedNames : RESIDENT_CAT_NAME_POOL;
  const randomValue = Number(random());
  const normalized = Number.isFinite(randomValue)
    ? Math.min(0.999999, Math.max(0, randomValue))
    : 0;
  return candidates[Math.floor(normalized * candidates.length)];
}

export function residentCatProfile(seatId) {
  return RESIDENT_CATS[seatId] ?? RESIDENT_CATS["seat-1"];
}

export function residentCatIdForSeat(seatId) {
  return residentCatProfile(seatId).id;
}

export function residentCatNameForSeat(seatId) {
  return residentCatProfile(seatId).name;
}

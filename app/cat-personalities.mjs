export const CAT_PERSONALITY_PROFILES = {
  energetic: {
    id: "energetic",
    label: "에너지 뿜뿜",
    description: "산책을 자주 하고 먼저 길을 돌아가는 활발한 친구예요.",
    moveSpeedMultiplier: 1.16,
    restDurationMultiplier: 0.72,
    preparationMultiplier: 0.76,
    yieldBias: 0.24,
    ambientWeights: {
      "idle-look": 3,
      "idle-relax": 1,
      sit: 1,
      "sit-play": 5,
      "sit-groom": 1,
      lie: 0.4,
    },
  },
  playful: {
    id: "playful",
    label: "장난꾸러기",
    description: "앉아서 놀다가 신나게 돌아다니는 놀이 좋아하는 친구예요.",
    moveSpeedMultiplier: 1.08,
    restDurationMultiplier: 0.86,
    preparationMultiplier: 0.88,
    yieldBias: 0.36,
    ambientWeights: {
      "idle-look": 2,
      "idle-relax": 1,
      sit: 1,
      "sit-play": 6,
      "sit-groom": 1.5,
      lie: 0.6,
    },
  },
  curious: {
    id: "curious",
    label: "호기심 대장",
    description: "주변을 오래 구경하고 새로운 장소를 찾아다니는 친구예요.",
    moveSpeedMultiplier: 1,
    restDurationMultiplier: 1,
    preparationMultiplier: 1,
    yieldBias: 0.48,
    ambientWeights: {
      "idle-look": 5,
      "idle-relax": 1.5,
      sit: 1.5,
      "sit-play": 2,
      "sit-groom": 2,
      lie: 0.8,
    },
  },
  gentle: {
    id: "gentle",
    label: "느긋한 평화주의자",
    description: "천천히 움직이고 다른 고양이에게 먼저 길을 양보해요.",
    moveSpeedMultiplier: 0.9,
    restDurationMultiplier: 1.28,
    preparationMultiplier: 1.12,
    yieldBias: 0.72,
    ambientWeights: {
      "idle-look": 1.5,
      "idle-relax": 4,
      sit: 3,
      "sit-play": 1,
      "sit-groom": 2,
      lie: 2,
    },
  },
  sleepy: {
    id: "sleepy",
    label: "잠꾸러기",
    description: "산책보다 쿠션에 누워 오래 자는 걸 가장 좋아해요.",
    moveSpeedMultiplier: 0.82,
    restDurationMultiplier: 1.7,
    preparationMultiplier: 1.25,
    yieldBias: 0.9,
    ambientWeights: {
      "idle-look": 0.8,
      "idle-relax": 3,
      sit: 3,
      "sit-play": 0.5,
      "sit-groom": 1.5,
      lie: 7,
    },
  },
};

export const CAT_STYLE_PERSONALITIES = {
  Abyssian: "energetic",
  Black: "gentle",
  BlackWhite: "playful",
  Blue: "curious",
  Bobtail: "playful",
  British: "gentle",
  Cream: "sleepy",
  Maine: "curious",
  Persian: "sleepy",
  Red: "energetic",
  RedWhite: "playful",
  Siamese: "curious",
  Simple: "gentle",
  Sphynx: "energetic",
  White: "sleepy",
};

export function catPersonalityForStyle(styleId) {
  return CAT_PERSONALITY_PROFILES[
    CAT_STYLE_PERSONALITIES[styleId ?? ""] ?? "curious"
  ];
}

export function pickPersonalityAmbientKey(profile, randomValue = Math.random()) {
  const weighted = Object.entries(profile.ambientWeights).filter(
    ([, weight]) => weight > 0,
  );
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999) * total;
  for (const [key, weight] of weighted) {
    cursor -= weight;
    if (cursor <= 0) return key;
  }
  return weighted.at(-1)?.[0] ?? "idle-look";
}

export function pickPersonalityYieldAnimation(
  profile,
  randomValue = Math.random(),
) {
  const weighted = ["idle-look", "idle-relax", "sit"].map((key) => [
    key,
    profile.ambientWeights[key] ?? 0,
  ]);
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.min(Math.max(randomValue, 0), 0.999999) * total;
  for (const [key, weight] of weighted) {
    cursor -= weight;
    if (cursor <= 0) return key;
  }
  return "idle-look";
}

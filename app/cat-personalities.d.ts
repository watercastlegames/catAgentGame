export type CatPersonalityId =
  | "energetic"
  | "playful"
  | "curious"
  | "gentle"
  | "sleepy";

export type CatPersonalityProfile = {
  id: CatPersonalityId;
  label: string;
  description: string;
  moveSpeedMultiplier: number;
  restDurationMultiplier: number;
  preparationMultiplier: number;
  yieldBias: number;
  ambientWeights: Record<string, number>;
};

export const CAT_PERSONALITY_PROFILES: Record<
  CatPersonalityId,
  CatPersonalityProfile
>;
export const CAT_STYLE_PERSONALITIES: Record<string, CatPersonalityId>;

export function catPersonalityForStyle(
  styleId: string | undefined,
): CatPersonalityProfile;
export function pickPersonalityAmbientKey(
  profile: CatPersonalityProfile,
  randomValue?: number,
): string;
export function pickPersonalityYieldAnimation(
  profile: CatPersonalityProfile,
  randomValue?: number,
): "idle-look" | "idle-relax" | "sit";

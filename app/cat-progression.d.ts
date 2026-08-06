export const CAT_PROGRESSION_KEY: string;
export const CAT_MAX_LEVEL: number;
export type CatExperienceAction =
  | "visit"
  | "chat"
  | "play"
  | "style"
  | "care"
  | "image";
export const CAT_XP_REWARDS: Readonly<Record<CatExperienceAction, number>>;
export type CatProgressionProfile = {
  totalXp: number;
  lastVisitDay: string | null;
  actions: Record<CatExperienceAction, number>;
  updatedAt: number;
};
export type CatProgressionStore = Record<string, CatProgressionProfile>;
export type CatLevelProgress = {
  level: number;
  currentXp: number;
  requiredXp: number;
  percent: number;
};
export function catXpRequiredForLevel(level: number): number;
export function catLevelProgress(totalXp: number): CatLevelProgress;
export function createCatProgressionProfile(): CatProgressionProfile;
export function parseCatProgressionStore(raw: unknown): CatProgressionStore;
export function ensureCatProgressionProfile(
  store: CatProgressionStore,
  catId: string,
): CatProgressionProfile;
export function grantCatExperience(
  store: CatProgressionStore,
  catId: string,
  action: CatExperienceAction,
  now?: number,
): {
  store: CatProgressionStore;
  profile: CatProgressionProfile;
  gained: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  progress: CatLevelProgress;
};

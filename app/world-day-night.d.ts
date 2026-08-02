export const WORLD_DAY_NIGHT_CYCLE_MS: number;
export const WORLD_DAY_NIGHT_STORAGE_KEY: string;
export const WORLD_DAY_NIGHT_DEFAULT_PHASE: number;

export type WorldDayNightSample = {
  phase: number;
  daylight: number;
  golden: number;
  sunset: number;
  night: number;
  dawn: number;
  stars: number;
  warmLights: number;
  sunX: number;
  sunHeight: number;
  sunVisibility: number;
  moonX: number;
  moonHeight: number;
  moonVisibility: number;
};

export function normalizeWorldDayNightPhase(value: number): number;
export function createWorldDayNightAnchor(nowMs: number, phase?: number): number;
export function worldDayNightPhaseAt(nowMs: number, anchorMs: number): number;
export function worldDayNightDebugPhase(value: string | null): number | null;
export function sampleWorldDayNight(phase: number): WorldDayNightSample;


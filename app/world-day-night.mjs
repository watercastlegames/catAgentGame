export const WORLD_DAY_NIGHT_CYCLE_MS = 10 * 60 * 1000;
export const WORLD_DAY_NIGHT_STORAGE_KEY = "agent-forest-day-night-anchor-v1";
export const WORLD_DAY_NIGHT_DEFAULT_PHASE = 0.08;

const KEYFRAMES = [
  {
    phase: 0,
    daylight: 1,
    golden: 0.08,
    sunset: 0,
    night: 0,
    dawn: 0,
    stars: 0,
    warmLights: 0,
  },
  {
    phase: 160 / 600,
    daylight: 0.92,
    golden: 1,
    sunset: 0.22,
    night: 0,
    dawn: 0,
    stars: 0,
    warmLights: 0,
  },
  {
    phase: 230 / 600,
    daylight: 0.48,
    golden: 0.82,
    sunset: 1,
    night: 0.08,
    dawn: 0,
    stars: 0.08,
    warmLights: 0.16,
  },
  {
    phase: 290 / 600,
    daylight: 0.08,
    golden: 0,
    sunset: 0.12,
    night: 1,
    dawn: 0,
    stars: 1,
    warmLights: 1,
  },
  {
    phase: 460 / 600,
    daylight: 0.06,
    golden: 0,
    sunset: 0,
    night: 0.94,
    dawn: 0.18,
    stars: 0.9,
    warmLights: 0.94,
  },
  {
    phase: 520 / 600,
    daylight: 0.38,
    golden: 0.22,
    sunset: 0.08,
    night: 0.48,
    dawn: 1,
    stars: 0.28,
    warmLights: 0.44,
  },
  {
    phase: 1,
    daylight: 1,
    golden: 0.08,
    sunset: 0,
    night: 0,
    dawn: 0,
    stars: 0,
    warmLights: 0,
  },
];

const DEBUG_PHASES = Object.freeze({
  day: 60 / 600,
  noon: 60 / 600,
  golden: 185 / 600,
  sunset: 230 / 600,
  night: 365 / 600,
  dawn: 500 / 600,
  sunrise: 545 / 600,
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function interpolate(left, right, progress) {
  return left + (right - left) * progress;
}

export function normalizeWorldDayNightPhase(value) {
  if (!Number.isFinite(value)) return WORLD_DAY_NIGHT_DEFAULT_PHASE;
  return ((value % 1) + 1) % 1;
}

export function createWorldDayNightAnchor(
  nowMs,
  phase = WORLD_DAY_NIGHT_DEFAULT_PHASE,
) {
  const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  return safeNow - normalizeWorldDayNightPhase(phase) * WORLD_DAY_NIGHT_CYCLE_MS;
}

export function worldDayNightPhaseAt(nowMs, anchorMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(anchorMs)) {
    return WORLD_DAY_NIGHT_DEFAULT_PHASE;
  }
  return normalizeWorldDayNightPhase(
    (nowMs - anchorMs) / WORLD_DAY_NIGHT_CYCLE_MS,
  );
}

export function worldDayNightDebugPhase(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized in DEBUG_PHASES) return DEBUG_PHASES[normalized];
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? normalizeWorldDayNightPhase(numeric) : null;
}

export function sampleWorldDayNight(phaseInput) {
  const phase = normalizeWorldDayNightPhase(phaseInput);
  let left = KEYFRAMES[0];
  let right = KEYFRAMES[KEYFRAMES.length - 1];

  for (let index = 0; index < KEYFRAMES.length - 1; index += 1) {
    if (
      phase >= KEYFRAMES[index].phase &&
      phase <= KEYFRAMES[index + 1].phase
    ) {
      left = KEYFRAMES[index];
      right = KEYFRAMES[index + 1];
      break;
    }
  }

  const progress = smoothstep01(
    (phase - left.phase) / Math.max(0.000001, right.phase - left.phase),
  );
  const read = (key) => interpolate(left[key], right[key], progress);

  let sunX = -0.3;
  let sunHeight = 0.72;
  let sunVisibility = 1;
  if (phase <= 290 / 600) {
    const travel = phase / (290 / 600);
    sunX = interpolate(-0.32, 0.74, travel);
    sunHeight = Math.max(0.015, Math.cos(travel * Math.PI * 0.5) * 0.76);
    sunVisibility = smoothstep01((290 / 600 - phase) / 0.08);
  } else if (phase >= 460 / 600) {
    const travel = (phase - 460 / 600) / (140 / 600);
    sunX = interpolate(-0.78, -0.3, travel);
    sunHeight = Math.max(0.015, Math.sin(travel * Math.PI * 0.48));
    sunVisibility = smoothstep01((phase - 475 / 600) / 0.08);
  } else {
    sunVisibility = 0;
    sunHeight = -0.2;
  }

  const moonTravel = clamp01((phase - 260 / 600) / (250 / 600));
  const moonVisibility =
    smoothstep01((phase - 265 / 600) / 0.07) *
    smoothstep01((535 / 600 - phase) / 0.08);

  return {
    phase,
    daylight: read("daylight"),
    golden: read("golden"),
    sunset: read("sunset"),
    night: read("night"),
    dawn: read("dawn"),
    stars: read("stars"),
    warmLights: read("warmLights"),
    sunX,
    sunHeight,
    sunVisibility,
    moonX: interpolate(-0.66, 0.72, moonTravel),
    moonHeight: Math.max(0.04, Math.sin(moonTravel * Math.PI)),
    moonVisibility,
  };
}

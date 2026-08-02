import assert from "node:assert/strict";
import test from "node:test";

import {
  WORLD_DAY_NIGHT_CYCLE_MS,
  createWorldDayNightAnchor,
  sampleWorldDayNight,
  worldDayNightDebugPhase,
  worldDayNightPhaseAt,
} from "../app/world-day-night.mjs";

test("world cycle repeats after exactly ten minutes", () => {
  const now = 1_800_000_000_000;
  const anchor = createWorldDayNightAnchor(now, 0.1);
  assert.ok(Math.abs(worldDayNightPhaseAt(now, anchor) - 0.1) < 1e-9);
  assert.ok(
    Math.abs(
      worldDayNightPhaseAt(now + WORLD_DAY_NIGHT_CYCLE_MS, anchor) - 0.1,
    ) < 1e-9,
  );
});

test("sunset preview exposes a low sun, warm horizon and reflection window", () => {
  const sunset = sampleWorldDayNight(worldDayNightDebugPhase("sunset"));
  assert.ok(sunset.sunset > 0.95);
  assert.ok(sunset.golden > 0.75);
  assert.ok(sunset.sunHeight < 0.25);
  assert.ok(sunset.sunVisibility > 0.8);
});

test("night preview enables stars, moon and warm office lights", () => {
  const night = sampleWorldDayNight(worldDayNightDebugPhase("night"));
  assert.ok(night.night > 0.9);
  assert.ok(night.stars > 0.85);
  assert.ok(night.moonVisibility > 0.8);
  assert.ok(night.warmLights > 0.9);
});

test("day and dawn debug aliases remain deterministic", () => {
  const day = sampleWorldDayNight(worldDayNightDebugPhase("day"));
  const dawn = sampleWorldDayNight(worldDayNightDebugPhase("dawn"));
  assert.ok(day.daylight > 0.9);
  assert.ok(day.night < 0.1);
  assert.ok(dawn.dawn > 0.65);
  assert.ok(dawn.stars < 0.75);
});


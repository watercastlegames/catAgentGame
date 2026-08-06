import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worldSource = await readFile(
  new URL("../app/agent-world-3d.tsx", import.meta.url),
  "utf8",
);
const pageSource = await readFile(
  new URL("../app/page.tsx", import.meta.url),
  "utf8",
);

test("exercise wheel uses the illustrated unlit Meshy material path", () => {
  assert.match(
    worldSource,
    /asset\.id === "cat-exercise-wheel" \? "unlit" : "source"/,
  );
  assert.match(worldSource, /catExerciseWheelRunYaw/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_USE_POSITION/);
  assert.match(worldSource, /height: 2\.13/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_CAT_LIFT = 0\.38/);
});

test("idle cats take exclusive autonomous turns running in the wheel", () => {
  assert.match(worldSource, /type CatExerciseWheelSession/);
  assert.match(worldSource, /updateCatExerciseWheelScheduler\(delta, primaryView\)/);
  assert.match(worldSource, /phase: "approaching"/);
  assert.match(worldSource, /phase = "running"/);
  assert.match(worldSource, /phase = "exiting"/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_EXIT_POSITION/);
  assert.match(worldSource, /playAnimation\("toy-run"/);
  assert.match(worldSource, /\["run", "\|Run_F"\]/);
  assert.match(worldSource, /completeCatExerciseWheelSession/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_RUN_SECONDS = 12/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_REVISIT_MIN_SECONDS = 90/);
  assert.match(worldSource, /CAT_EXERCISE_WHEEL_REVISIT_MAX_SECONDS = 150/);
});

test("wheel completion walks the cat outside before restoring ambient behavior", () => {
  assert.match(
    worldSource,
    /moveSecondaryTowards\(\s*entry,\s*catExerciseWheelExitPosition,/,
  );
  assert.match(
    worldSource,
    /desiredPosition\.copy\(catExerciseWheelExitPosition\)/,
  );
  assert.match(
    worldSource,
    /primaryWheelSession\.phase = "exiting"[\s\S]*completeCatExerciseWheelSession\(\)/,
  );
});

test("wheel completion returns happiness through the owning cat callback", () => {
  assert.match(worldSource, /onCatWheelPlayRef\.current\?\./);
  assert.match(pageSource, /const handleCatWheelPlay = useCallback/);
  assert.match(pageSource, /happiness: before\.happiness \+ 3/);
  assert.match(pageSource, /onCatWheelPlay=\{handleCatWheelPlay\}/);
});

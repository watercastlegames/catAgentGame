import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/cat-needs.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const catNeeds = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const {
  CAT_CARE_SEEK_THRESHOLD,
  EMPTY_BOWL_HAPPINESS_LOSS,
  HUNGER_FILL_MS,
  NEEDS_KEY,
  NEEDS_OFFLINE_CAP_MS,
  TOILET_FILL_MS,
  applyCatCareOutcome,
  computeCatNeedState,
  computeCurrentValue,
  createDefaultCatNeedState,
  getHappinessBand,
  getNeedTone,
  parseCatNeedsStore,
  selectCatCareIntent,
  updateCatNeedState,
} = catNeeds;

test("cat needs start at the integrated-plan defaults", () => {
  const state = createDefaultCatNeedState(1_000);
  assert.equal(NEEDS_KEY, "agent-forest-cat-needs-v1");
  assert.deepEqual(state, {
    hunger: 0,
    toilet: 0,
    happiness: 30,
    lastComputedAt: 1_000,
  });
});

test("hunger and toilet fill at their independent rates", () => {
  assert.equal(computeCurrentValue(0, 0, HUNGER_FILL_MS, HUNGER_FILL_MS), 100);
  assert.equal(
    computeCurrentValue(0, 0, TOILET_FILL_MS, TOILET_FILL_MS / 2),
    50,
  );
});

test("offline progress is capped at twelve hours and happiness does not decay", () => {
  const start = createDefaultCatNeedState(10_000);
  const current = computeCatNeedState(
    { ...start, hunger: 10, toilet: 5, happiness: 22 },
    10_000 + NEEDS_OFFLINE_CAP_MS * 4,
  );
  assert.equal(current.hunger, 100);
  assert.equal(current.toilet, 100);
  assert.equal(current.happiness, 22);
  assert.equal(getHappinessBand(current.happiness), "sulky");
});

test("need tones switch only at the display thresholds", () => {
  assert.equal(getNeedTone(59.9), "normal");
  assert.equal(getNeedTone(60), "warning");
  assert.equal(getNeedTone(85), "danger");
  assert.equal(getNeedTone(100), "forced");
});

test("event updates clamp values and malformed storage fails closed", () => {
  const fed = updateCatNeedState(
    createDefaultCatNeedState(1_000),
    { hunger: 0, happiness: 103 },
    2_000,
  );
  assert.equal(fed.hunger, 0);
  assert.equal(fed.happiness, 100);
  assert.deepEqual(parseCatNeedsStore("{bad json", 2_000), {});
});

test("care intent prioritizes the most urgent danger need", () => {
  assert.equal(CAT_CARE_SEEK_THRESHOLD, 85);
  assert.equal(selectCatCareIntent({ hunger: 84, toilet: 84 }), null);
  assert.equal(selectCatCareIntent({ hunger: 90, toilet: 86 }), "food");
  assert.equal(selectCatCareIntent({ hunger: 88, toilet: 96 }), "toilet");
});

test("care outcomes consume needs and empty bowls reduce happiness", () => {
  const state = {
    hunger: 92,
    toilet: 91,
    happiness: 50,
    lastComputedAt: 1_000,
  };
  const fed = applyCatCareOutcome(state, "meal-completed", 1_000);
  assert.equal(fed.hunger, 0);
  assert.equal(fed.happiness, 54);

  const missed = applyCatCareOutcome(state, "meal-missed", 1_000);
  assert.equal(missed.hunger, 92);
  assert.equal(missed.happiness, 50 - EMPTY_BOWL_HAPPINESS_LOSS);

  const relieved = applyCatCareOutcome(state, "toilet-completed", 1_000);
  assert.equal(relieved.toilet, 0);
  assert.equal(relieved.happiness, 52);

  const blocked = applyCatCareOutcome(state, "toilet-blocked", 1_000);
  assert.equal(blocked.toilet, 91);
  assert.equal(blocked.happiness, 42);
});

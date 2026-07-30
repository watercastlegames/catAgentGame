import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/food-bowl-state.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const food = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("migrates new, full, and empty food bowl storage independently", () => {
  assert.deepEqual(food.parseFoodBowlState(null), {
    grade: "Basic",
    portionsRemaining: 4,
  });
  assert.deepEqual(food.parseFoodBowlState("full"), {
    grade: "Basic",
    portionsRemaining: 4,
  });
  assert.deepEqual(food.parseFoodBowlState("empty"), {
    grade: null,
    portionsRemaining: 0,
  });
});

test("food grades use the final prices and consume exactly one portion", () => {
  assert.equal(food.FOOD_PROFILES.Basic.price, 12);
  assert.equal(food.FOOD_PROFILES.Advanced.price, 28);
  assert.equal(food.FOOD_PROFILES.Premium.price, 55);
  assert.equal(food.FOOD_PROFILES.Premium.satiationMinutes, 240);

  let bowl = food.fillFoodBowl("Advanced");
  bowl = food.consumeFoodPortion(bowl);
  assert.deepEqual(bowl, { grade: "Advanced", portionsRemaining: 3 });
  bowl = food.consumeFoodPortion(bowl);
  bowl = food.consumeFoodPortion(bowl);
  bowl = food.consumeFoodPortion(bowl);
  assert.deepEqual(bowl, { grade: null, portionsRemaining: 0 });
});

test("malformed food storage fails to the safe new-install default", () => {
  assert.deepEqual(food.parseFoodBowlState("{bad"), {
    grade: "Basic",
    portionsRemaining: 4,
  });
});

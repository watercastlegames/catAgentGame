import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/world-facility-economy.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const facilities = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("exercise wheel starts locked and is restored only from known ownership", () => {
  assert.deepEqual(facilities.createDefaultWorldFacilityState(), {
    version: 1,
    owned: [],
  });
  assert.deepEqual(
    facilities.parseWorldFacilityState(
      JSON.stringify({ version: 1, owned: ["cat-exercise-wheel", "unknown"] }),
    ),
    { version: 1, owned: ["cat-exercise-wheel"] },
  );
});
test("exercise wheel charges once and remains owned", () => {
  const initial = facilities.createDefaultWorldFacilityState();
  const failed = facilities.purchaseCatExerciseWheel(119, initial);
  assert.equal(failed.ok, false);
  assert.equal(failed.required, 120);

  const bought = facilities.purchaseCatExerciseWheel(180, initial);
  assert.equal(bought.ok, true);
  assert.equal(bought.charged, 120);
  assert.equal(bought.balance, 60);
  assert.deepEqual(bought.state.owned, ["cat-exercise-wheel"]);

  const owned = facilities.purchaseCatExerciseWheel(60, bought.state);
  assert.equal(owned.ok, true);
  assert.equal(owned.charged, 0);
  assert.equal(owned.balance, 60);
});

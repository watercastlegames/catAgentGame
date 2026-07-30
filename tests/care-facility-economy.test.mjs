import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/care-facility-economy.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const economy = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("one food bowl is free by default and ownership caps at two", () => {
  assert.equal(economy.parseOwnedFoodBowlCount(null), 1);
  assert.equal(economy.parseOwnedFoodBowlCount("1"), 1);
  assert.equal(economy.parseOwnedFoodBowlCount("2"), 2);
  assert.equal(economy.parseOwnedFoodBowlCount("99"), 2);
  assert.equal(economy.MAX_OWNED_FOOD_BOWL_COUNT, 2);
});

test("the second food bowl charges once and insufficient shells do not unlock", () => {
  assert.deepEqual(economy.purchaseSecondFoodBowl(59, 1), {
    ok: false,
    balance: 59,
    count: 1,
    charged: 0,
    required: 60,
  });
  assert.deepEqual(economy.purchaseSecondFoodBowl(100, 1), {
    ok: true,
    balance: 40,
    count: 2,
    charged: 60,
  });
  assert.deepEqual(economy.purchaseSecondFoodBowl(40, 2), {
    ok: true,
    balance: 40,
    count: 2,
    charged: 0,
  });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/cat-style-economy.ts", import.meta.url),
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

test("every shipped cat style has a non-zero shell price", () => {
  const expectedStyles = [
    "Abyssian",
    "Black",
    "BlackWhite",
    "Blue",
    "Bobtail",
    "British",
    "Cream",
    "Maine",
    "Persian",
    "Red",
    "RedWhite",
    "Siamese",
    "Simple",
    "Sphynx",
    "White",
  ];
  assert.deepEqual(Object.keys(economy.CAT_STYLE_PRICES).sort(), expectedStyles);
  assert.ok(Object.values(economy.CAT_STYLE_PRICES).every((price) => price > 0));
  assert.equal(economy.CAT_STYLE_PRICES.White, 75);
  assert.equal(economy.CAT_STYLE_PRICES.Maine, 200);
});

test("owned styles are free to reapply and new styles charge once", () => {
  const owned = new Set(["Blue"]);
  const reapplied = economy.purchaseCatStyle("Blue", 50, owned);
  assert.equal(reapplied.ok, true);
  assert.equal(reapplied.balance, 50);
  assert.equal(reapplied.charged, 0);

  const purchased = economy.purchaseCatStyle("White", 100, owned);
  assert.equal(purchased.ok, true);
  assert.equal(purchased.balance, 25);
  assert.equal(purchased.charged, 75);
  assert.equal(purchased.ownedStyles.has("White"), true);
});

test("invalid storage fails closed and insufficient balances do not unlock", () => {
  assert.deepEqual([...economy.parseOwnedCatStyles("{bad", "Blue")], ["Blue"]);
  const result = economy.purchaseCatStyle("Maine", 12, new Set(["Blue"]));
  assert.deepEqual(result, {
    ok: false,
    reason: "insufficient-shells",
    required: 200,
  });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/workstation-decor.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const decor = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("the workstation catalog contains twelve priced items in four slots", () => {
  assert.equal(decor.WORKSTATION_DECOR_CATALOG.length, 12);
  assert.deepEqual(
    new Set(decor.WORKSTATION_DECOR_CATALOG.map((item) => item.slot)),
    new Set(["deskTop", "inputDevice", "seatCushion", "floorAmbient"]),
  );
  assert.ok(decor.WORKSTATION_DECOR_CATALOG.every((item) => item.price > 0));
});

test("buying charges once and each seat keeps an independent equipped item", () => {
  let state = decor.createDefaultWorkstationDecorState();
  const bought = decor.purchaseOrEquipWorkstationDecor({
    state,
    seatId: "seat-1",
    itemId: "enamel-mug",
    shells: 100,
    unlockedSeatCount: 1,
  });
  assert.equal(bought.ok, true);
  assert.equal(bought.charged, 15);
  assert.equal(bought.balance, 85);
  state = bought.state;

  const equippedElsewhere = decor.purchaseOrEquipWorkstationDecor({
    state,
    seatId: "seat-2",
    itemId: "enamel-mug",
    shells: 85,
    unlockedSeatCount: 2,
  });
  assert.equal(equippedElsewhere.ok, true);
  assert.equal(equippedElsewhere.charged, 0);
  assert.equal(
    equippedElsewhere.state.equipped["seat-1"].deskTop,
    "enamel-mug",
  );
  assert.equal(
    equippedElsewhere.state.equipped["seat-2"].deskTop,
    "enamel-mug",
  );
});

test("locked and unaffordable items fail without changing ownership", () => {
  const state = decor.createDefaultWorkstationDecorState();
  assert.equal(
    decor.purchaseOrEquipWorkstationDecor({
      state,
      seatId: "seat-1",
      itemId: "shell-windchime",
      shells: 999,
      unlockedSeatCount: 1,
    }).reason,
    "locked",
  );
  assert.equal(
    decor.purchaseOrEquipWorkstationDecor({
      state,
      seatId: "seat-1",
      itemId: "enamel-mug",
      shells: 2,
      unlockedSeatCount: 1,
    }).reason,
    "insufficient-shells",
  );
});

test("malformed saved data fails closed and drops invalid equipment", () => {
  assert.deepEqual(
    decor.parseWorkstationDecorState("{not-json"),
    decor.createDefaultWorkstationDecorState(),
  );
  const parsed = decor.parseWorkstationDecorState(
    JSON.stringify({
      version: 2,
      owned: ["enamel-mug", "unknown"],
      equipped: {
        "seat-1": { deskTop: "enamel-mug", inputDevice: "enamel-mug" },
      },
    }),
  );
  assert.deepEqual(parsed.owned, ["enamel-mug"]);
  assert.equal(parsed.equipped["seat-1"].deskTop, "enamel-mug");
  assert.equal(parsed.equipped["seat-1"].inputDevice, undefined);
});

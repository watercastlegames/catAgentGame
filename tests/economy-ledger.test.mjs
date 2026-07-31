import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/economy-ledger.ts", import.meta.url),
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

test("world shells stop at forty per local day", () => {
  let counter = economy.createDailyCounter(new Date(2026, 6, 30));
  for (let index = 0; index < 45; index += 1) {
    counter = economy.claimWorldShells(counter, 1).counter;
  }
  assert.equal(counter.count, 40);
  assert.equal(counter.reward, 40);
  assert.equal(economy.claimWorldShells(counter, 1).reward, 0);
});

test("task rewards use 15, 8, and 3 shell tiers and stop at twenty", () => {
  let counter = economy.createDailyCounter(new Date(2026, 6, 30));
  let total = 0;
  for (let index = 0; index < 25; index += 1) {
    const claim = economy.claimTaskReward(counter, "codex");
    counter = claim.counter;
    total += claim.reward;
  }
  assert.equal(counter.count, 20);
  assert.equal(total, 145);
  assert.equal(counter.reward, 145);
});

test("simulation tasks never count or pay and dates reset safely", () => {
  const today = new Date(2026, 6, 30);
  const counter = economy.createDailyCounter(today);
  assert.deepEqual(economy.claimTaskReward(counter, "simulation"), {
    counter,
    reward: 0,
  });
  const restored = economy.parseDailyCounter(
    JSON.stringify({ date: "2026-07-29", count: 20, reward: 145 }),
    today,
  );
  assert.deepEqual(restored, {
    date: "2026-07-30",
    count: 0,
    reward: 0,
  });
});

test("the first successful question each local day pays once", () => {
  const dayOne = new Date(2026, 6, 30, 9, 0);
  const dayTwo = new Date(2026, 6, 31, 9, 0);
  let state = economy.createEngagementRewardState();

  const first = economy.claimDailyFirstQuestionReward(state, dayOne);
  state = first.state;
  assert.equal(first.reward, 5);
  assert.equal(
    economy.claimDailyFirstQuestionReward(state, dayOne).reward,
    0,
  );
  assert.equal(
    economy.claimDailyFirstQuestionReward(state, dayTwo).reward,
    5,
  );
});

test("each purchase category pays its first-purchase milestone only once", () => {
  let state = economy.createEngagementRewardState();
  for (const kind of economy.FIRST_PURCHASE_KINDS) {
    const first = economy.claimFirstPurchaseReward(state, kind);
    state = first.state;
    assert.equal(first.reward, 5, `${kind} should pay once`);
    assert.equal(
      economy.claimFirstPurchaseReward(state, kind).reward,
      0,
      `${kind} should not pay twice`,
    );
  }

  const restored = economy.parseEngagementRewardState(
    JSON.stringify({
      dailyQuestionDate: "2026-07-30",
      firstPurchases: ["seat", "seat", "unknown"],
    }),
  );
  assert.deepEqual(restored, {
    dailyQuestionDate: "2026-07-30",
    firstPurchases: ["seat"],
  });
});

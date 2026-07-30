import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../app/cat-interactions.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const interactions = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("snacks use the 5, 3, and 1 happiness soft cap", () => {
  assert.equal(interactions.snackHappinessGain(1), 5);
  assert.equal(interactions.snackHappinessGain(3), 5);
  assert.equal(interactions.snackHappinessGain(4), 3);
  assert.equal(interactions.snackHappinessGain(6), 3);
  assert.equal(interactions.snackHappinessGain(7), 1);
  assert.equal(interactions.snackHappinessGain(8), 1);
});

test("completed snacks apply a sixty-second cooldown and daily cap", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  let log = {};
  for (let index = 0; index < 8; index += 1) {
    log = interactions.completeSnack(log, "cat-1", now + index * 60_000).log;
  }
  assert.equal(
    interactions.snackAvailability(log, "cat-1", now + 9 * 60_000).reason,
    "daily-cap",
  );
});

test("a new local day resets stale snack counters", () => {
  const raw = JSON.stringify({
    "cat-1": {
      date: "2026-07-29",
      count: 8,
      lastCompletedAt: 123,
    },
  });
  assert.deepEqual(
    interactions.parseSnackLog(raw, new Date(2026, 6, 30)),
    {
      "cat-1": {
        date: "2026-07-30",
        count: 0,
        lastCompletedAt: 0,
      },
    },
  );
});

test("laser play uses a six-use cap with 3, 2, and 1 happiness", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  let log = {};
  const gains = [];
  for (let index = 0; index < 6; index += 1) {
    const completed = interactions.completePlay(
      log,
      "cat-1",
      "laser",
      now + index * 60_000,
    );
    log = completed.log;
    gains.push(completed.happinessGain);
  }
  assert.deepEqual(gains, [3, 3, 2, 2, 1, 1]);
  assert.equal(
    interactions.playAvailability(
      log,
      "cat-1",
      "laser",
      now + 7 * 60_000,
    ).reason,
    "daily-cap",
  );
});

test("feather toy uses its original six-play happiness balance", () => {
  const now = new Date(2026, 6, 30, 12).getTime();
  let log = {};
  const gains = [];
  for (let index = 0; index < 6; index += 1) {
    const completed = interactions.completePlay(
      log,
      "cat-1",
      "toy",
      now + index * 60_000,
    );
    log = completed.log;
    gains.push(completed.happinessGain);
  }
  assert.deepEqual(gains, [5, 5, 3, 3, 1, 1]);
});

test("petting grants three happiness only once per ten minutes", () => {
  const first = interactions.completePetting({}, "cat-1", 1_000);
  assert.equal(first.accepted, true);
  assert.equal(first.happinessGain, 3);
  assert.equal(first.log["cat-1"], 1_000);

  const blocked = interactions.completePetting(first.log, "cat-1", 300_000);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.happinessGain, 0);
  assert.equal(blocked.waitMs, 301_000);

  const ready = interactions.completePetting(first.log, "cat-1", 601_000);
  assert.equal(ready.accepted, true);
  assert.equal(ready.happinessGain, 3);
});

test("petting storage drops malformed timestamps", () => {
  assert.deepEqual(
    interactions.parsePettingLog(
      JSON.stringify({ "cat-1": 1234, bad: "later", negative: -1 }),
    ),
    { "cat-1": 1234 },
  );
  assert.deepEqual(interactions.parsePettingLog("{broken"), {});
});

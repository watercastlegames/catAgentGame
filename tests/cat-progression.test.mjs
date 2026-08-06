import assert from "node:assert/strict";
import test from "node:test";
import {
  CAT_XP_REWARDS,
  catLevelProgress,
  grantCatExperience,
  parseCatProgressionStore,
} from "../app/cat-progression.mjs";

test("levels a cat from completed relationship actions", () => {
  let store = {};
  for (const action of ["visit", "chat", "play", "care", "image"]) {
    store = grantCatExperience(store, "cat-a", action, Date.now()).store;
  }
  const expected =
    CAT_XP_REWARDS.visit +
    CAT_XP_REWARDS.chat +
    CAT_XP_REWARDS.play +
    CAT_XP_REWARDS.care +
    CAT_XP_REWARDS.image;
  assert.equal(store["cat-a"].totalXp, expected);
  assert.equal(catLevelProgress(expected).level, 2);
});

test("keeps progression independent per cat and limits visit XP to once a day", () => {
  const now = Date.now();
  const first = grantCatExperience({}, "cat-a", "visit", now);
  const duplicate = grantCatExperience(first.store, "cat-a", "visit", now + 1_000);
  const other = grantCatExperience(duplicate.store, "cat-b", "visit", now + 1_000);

  assert.equal(first.gained, CAT_XP_REWARDS.visit);
  assert.equal(duplicate.gained, 0);
  assert.equal(other.gained, CAT_XP_REWARDS.visit);
  assert.equal(other.store["cat-a"].totalXp, CAT_XP_REWARDS.visit);
  assert.equal(other.store["cat-b"].totalXp, CAT_XP_REWARDS.visit);
});

test("repairs malformed saved progression", () => {
  const parsed = parseCatProgressionStore(
    JSON.stringify({
      cat: { totalXp: -10, actions: { chat: 3, play: "bad" } },
    }),
  );
  assert.equal(parsed.cat.totalXp, 0);
  assert.equal(parsed.cat.actions.chat, 3);
  assert.equal(parsed.cat.actions.play, 0);
});

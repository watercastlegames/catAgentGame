import assert from "node:assert/strict";
import test from "node:test";

import {
  LITTER_BOX_MAX_LEVEL,
  LITTER_TIER_STORAGE_KEY,
  addLitterWaste,
  cleanLitterBox,
  isLitterBoxFull,
  litterCapacityForTier,
  parseLitterLevel,
  parseLitterTier,
} from "../app/litter-box-state.mjs";

test("litter waste accumulates and clamps at a full box", () => {
  assert.equal(addLitterWaste(0), 34);
  assert.equal(addLitterWaste(34), 68);
  assert.equal(addLitterWaste(68), LITTER_BOX_MAX_LEVEL);
  assert.equal(isLitterBoxFull(99), false);
  assert.equal(isLitterBoxFull(100), true);
});

test("cleaning resets the litter box and malformed storage fails clean", () => {
  assert.equal(parseLitterLevel("72"), 72);
  assert.equal(parseLitterLevel("not-a-number"), 0);
  assert.equal(parseLitterLevel("-10"), 0);
  assert.equal(cleanLitterBox(), 0);
});

test("litter tiers extend one physical facility without breaking tier one", () => {
  assert.equal(LITTER_TIER_STORAGE_KEY, "agent-forest-litter-tier-v1");
  assert.equal(parseLitterTier(null), 1);
  assert.equal(parseLitterTier("2"), 2);
  assert.equal(parseLitterTier("3"), 3);
  assert.equal(parseLitterTier("9"), 1);
  assert.equal(litterCapacityForTier(1), 100);
  assert.equal(litterCapacityForTier(2), 200);
  assert.equal(litterCapacityForTier(3), 300);
  assert.equal(addLitterWaste(190, 34, 200), 200);
  assert.equal(isLitterBoxFull(199, 200), false);
  assert.equal(isLitterBoxFull(200, 200), true);
});

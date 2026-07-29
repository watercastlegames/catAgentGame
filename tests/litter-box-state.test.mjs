import assert from "node:assert/strict";
import test from "node:test";

import {
  LITTER_BOX_MAX_LEVEL,
  addLitterWaste,
  cleanLitterBox,
  isLitterBoxFull,
  parseLitterLevel,
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

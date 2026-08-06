import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worldSource = await readFile(
  new URL("../app/agent-world-3d.tsx", import.meta.url),
  "utf8",
);

test("eating cats face the center of their claimed food bowl", () => {
  assert.match(worldSource, /const foodBowlCenterPosition/);
  assert.match(
    worldSource,
    /bowlCenter\.x - entry\.root\.position\.x[\s\S]*bowlCenter\.z - entry\.root\.position\.z/,
  );
  assert.match(
    worldSource,
    /bowlCenter\.x - currentPosition\.x[\s\S]*bowlCenter\.z - currentPosition\.z/,
  );
  assert.match(worldSource, /CARE_EATING_TURN_SPEED = 14/);
  assert.equal(
    worldSource.match(/foodBowlCenterPosition\(claimedIndex\)/g)?.length,
    2,
    "both primary and secondary cats must snap to the bowl center before eating",
  );
  assert.match(
    worldSource,
    /characterVisual\.rotation\.y = characterYaw/,
    "the animated FBX root must not overwrite the primary cat's feeding yaw",
  );
  assert.match(
    worldSource,
    /entry\.visual\.rotation\.y = entry\.yaw/,
    "the animated FBX root must not overwrite a secondary cat's feeding yaw",
  );
});

test("food alignment follows each moved or additional bowl", () => {
  assert.match(
    worldSource,
    /foodBowlInstances\[facilityIndex \?\? 0\][\s\S]*\.group\.position/,
  );
  assert.match(worldSource, /carePreviewMode === care\.intent/);
});

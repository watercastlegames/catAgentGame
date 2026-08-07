import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);
const worldUrl = new URL("../app/agent-world-3d.tsx", import.meta.url);

test("stores and renders a style independently for each resident cat", async () => {
  const [page, world] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(worldUrl, "utf8"),
  ]);

  assert.match(page, /useState<Record<string, string>>\(\{\}\)/);
  assert.match(page, /\[focusedCatId\]: style/);
  assert.match(page, /\[focusedResidentCatId\]: style/);
  assert.match(page, /JSON\.stringify\(\{ styles: next/);
  assert.match(page, /catStyle:\s*catStyles\[catId\]/);
  assert.match(world, /characterModelsByStyle\.get\(seat\.catStyle/);
  assert.match(world, /requestedCatStyles/);
});

test("routes each cat to its own workstation and separates overlapping cats", async () => {
  const world = await readFile(worldUrl, "utf8");

  assert.match(
    world,
    /"seat-1": new THREE\.Vector3\(2\.12, 0, 4\.12\)/,
  );
  assert.match(
    world,
    /"seat-2": new THREE\.Vector3\(-2\.08, 0, -2\.82\)/,
  );
  assert.match(world, /"seat-3": new THREE\.Vector3\(-2\.3, 0, 0\.34\)/);
  assert.match(world, /"seat-1": LOW_MONITOR_WORKING_MARKER_WORLD_POSITION/);
  assert.match(world, /CAT_MIN_SEPARATION = 0\.62/);
  assert.match(world, /CAT_AVOIDANCE_LOOK_AHEAD = 1\.24/);
  assert.match(world, /CAT_CROWD_REDIRECT_DISTANCE = 0\.76/);
  assert.match(world, /CAT_AVOIDANCE_HOLD_MIN_SECONDS = 0\.9/);
  assert.match(world, /pickPersonalityYieldAnimation/);
  assert.match(world, /entry\.avoidance\.pauseAnimationKey/);
  assert.match(world, /const chooseCrowdRedirect = \(/);
  assert.match(world, /entry\.ambientTarget\.copy\(crowdRedirect\.target\)/);
  assert.match(world, /ambientTarget\.copy\(crowdRedirect\.target\)/);
  assert.match(world, /const enforceCatSeparation = \(delta: number\) =>/);
  assert.match(world, /CAT_SEPARATION_CORRECTION_SPEED \* delta/);
  assert.match(world, /enforceCatSeparation\(delta\);/);
});

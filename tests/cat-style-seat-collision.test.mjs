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
    /"seat-2": new THREE\.Vector3\(-2\.05, 0, -2\.48\)/,
  );
  assert.match(world, /"seat-1": LOW_MONITOR_WORKING_MARKER_WORLD_POSITION/);
  assert.match(world, /CAT_MIN_SEPARATION = 0\.44/);
  assert.match(world, /const enforceCatSeparation = \(\) =>/);
  assert.match(world, /enforceCatSeparation\(\);/);
});

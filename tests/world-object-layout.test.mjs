import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HARD_CODED_WORLD_OBJECT_LAYOUT,
  isWorldLayoutAdminHost,
  parseWorldObjectLayout,
  transformObstacleBounds,
  transformWorldPoint,
} from "../app/world-object-layout.mjs";

test("only local administrator hosts can open the placement editor", () => {
  assert.equal(isWorldLayoutAdminHost("localhost"), true);
  assert.equal(isWorldLayoutAdminHost("127.0.0.1"), true);
  assert.equal(isWorldLayoutAdminHost("agent-forest.example.com"), false);
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT, {});
});

test("saved world layout accepts only finite transforms", () => {
  assert.deepEqual(
    parseWorldObjectLayout(
      JSON.stringify({
        desk: { x: 2.4, z: -1.2, rotationY: 0.5 },
        broken: { x: "2.4", z: 0, rotationY: 0 },
      }),
    ),
    {
      desk: { x: 2.4, z: -1.2, rotationY: 0.5 },
    },
  );
  assert.deepEqual(parseWorldObjectLayout("{"), {});
});

test("anchored interaction points follow object translation and yaw", () => {
  const transformed = transformWorldPoint(
    { x: 2, z: 0 },
    { x: 1, z: 0, rotationY: 0 },
    { x: 3, z: 4, rotationY: Math.PI / 2 },
  );

  assert.ok(Math.abs(transformed.x - 3) < 1e-9);
  assert.ok(Math.abs(transformed.z - 3) < 1e-9);
});

test("collision bounds rotate into a conservative world-space AABB", () => {
  const transformed = transformObstacleBounds(
    { minX: -2, maxX: 2, minZ: -1, maxZ: 1 },
    { x: 0, z: 0, rotationY: 0 },
    { x: 5, z: 6, rotationY: Math.PI / 2 },
  );

  assert.ok(Math.abs(transformed.minX - 4) < 1e-9);
  assert.ok(Math.abs(transformed.maxX - 6) < 1e-9);
  assert.ok(Math.abs(transformed.minZ - 4) < 1e-9);
  assert.ok(Math.abs(transformed.maxZ - 8) < 1e-9);
});

test("administrator placement mode reveals and exports every object", async () => {
  const source = await readFile(
    new URL("../app/agent-world-3d.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /workstation\.visible\s*=\s*\n\s*layoutEditorEnabled\s*\|\|/,
  );
  assert.match(
    source,
    /layoutAdminEnabled && ready && !failed/,
  );
  assert.match(source, /host\.dataset\.savedWorldLayout/);
  assert.match(source, /saveLayout: saveCurrentWorldLayout/);
  assert.match(source, /공통 기본 배치로 하드코딩합니다/);
});

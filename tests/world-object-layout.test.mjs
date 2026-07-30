import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CARE_FACILITY_LAYOUT_IDS,
  HARD_CODED_WORLD_OBJECT_LAYOUT,
  MAX_CARE_FACILITY_COUNT,
  countCareFacilities,
  isWorldLayoutAdminHost,
  parseWorldObjectLayout,
  transformObstacleBounds,
  transformWorldPoint,
} from "../app/world-object-layout.mjs";

test("only local administrator hosts can open the placement editor", () => {
  assert.equal(isWorldLayoutAdminHost("localhost"), true);
  assert.equal(isWorldLayoutAdminHost("127.0.0.1"), true);
  assert.equal(isWorldLayoutAdminHost("agent-forest.example.com"), false);
  assert.equal(Object.keys(HARD_CODED_WORLD_OBJECT_LAYOUT).length, 22);
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT["cat-food-bowl"], {
    x: 0.9489761437078331,
    z: -4.880297227790361,
    rotationY: -0.18,
  });
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT["cat-food-bowl-2"], {
    x: 0.2919061318912837,
    z: -4.921080985354045,
    rotationY: 0.12,
  });
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT["covered-cat-litter-box"], {
    x: 1.909461366243032,
    z: -4.51832047983328,
    rotationY: -0.4217993877991494,
  });
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT["covered-cat-litter-box-2"], {
    x: 2.816903381150222,
    z: -3.7428912544515436,
    rotationY: -0.6053981633974482,
  });
  assert.deepEqual(HARD_CODED_WORLD_OBJECT_LAYOUT["tent-workstation"], {
    x: -1.3283313098701015,
    z: -4.226114884521053,
    rotationY: 0.08000000000000002,
  });
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

test("care facilities restore one or two placed instances with a hard cap", () => {
  assert.equal(MAX_CARE_FACILITY_COUNT, 2);
  assert.deepEqual(CARE_FACILITY_LAYOUT_IDS.food, [
    "cat-food-bowl",
    "cat-food-bowl-2",
  ]);
  assert.equal(countCareFacilities({}, "food"), 1);
  assert.equal(countCareFacilities(HARD_CODED_WORLD_OBJECT_LAYOUT, "food"), 2);
  assert.equal(
    countCareFacilities(HARD_CODED_WORLD_OBJECT_LAYOUT, "toilet"),
    2,
  );
  assert.equal(
    countCareFacilities(
      {
        "cat-food-bowl-2": { x: 1.1, z: -3.6, rotationY: 0.12 },
      },
      "food",
    ),
    2,
  );
  assert.equal(
    countCareFacilities(
      {
        "covered-cat-litter-box-2": {
          x: 3.4,
          z: -3.6,
          rotationY: 0.18,
        },
      },
      "toilet",
    ),
    2,
  );
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
  assert.match(source, /addCareFacility: \(intent\)/);
  assert.match(
    source,
    /initialWorldLayout[\s\S]*HARD_CODED_WORLD_OBJECT_LAYOUT[\s\S]*savedWorldLayout/,
  );
  assert.match(source, /밥그릇 추가/);
  assert.match(source, /화장실 추가/);
  assert.match(source, /claimableCareFacilityIndex/);
  assert.match(source, /facility\.occupants\.findIndex/);
  assert.match(source, /공통 기본 배치로 하드코딩합니다/);
});

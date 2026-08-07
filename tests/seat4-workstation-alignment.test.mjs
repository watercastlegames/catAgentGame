import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const world = await readFile(
  new URL("../app/agent-world-3d.tsx", import.meta.url),
  "utf8",
);

test("seat 4 works directly in front of its folding laptop", () => {
  assert.match(
    world,
    /music:\s*new THREE\.Vector3\(1\.87, 0, 0\.62\)/,
  );
  assert.match(
    world,
    /"seat-4":\s*new THREE\.Vector3\(1\.87, 0, 0\.62\)/,
  );
  assert.match(world, /SEAT_4_WORK_VISUAL_LIFT = 0\.13/);
  assert.match(
    world,
    /seat\.status === "working" && entry\.seatId === "seat-4"/,
  );

  const seat4Case = world.slice(
    world.indexOf("case FOLDING_LAPTOP_STATION_OBSTACLE.id:"),
    world.indexOf("case DESK_OBSTACLE.id:"),
  );
  assert.match(seat4Case, /SEAT_WORLD_POSITIONS\["seat-4"\]/);
  assert.match(seat4Case, /WORLD_TARGETS\.music/);
  assert.doesNotMatch(seat4Case, /keepAnchoredVectorOutsideObstacle/);
});

test("working-seat preview is local-only and drives seat 4 into working state", () => {
  assert.match(world, /requestedWorkPreview === "seat-4"/);
  assert.match(world, /window\.location\.hostname/);
  assert.match(
    world,
    /seatId: "seat-4",[\s\S]*?status: "working"/,
  );
  assert.match(
    world,
    /activeSeatCountRef\.current = localWorkPreviewEnabled \? 4 : activeSeatCount/,
  );
});

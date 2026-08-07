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
    /music:\s*new THREE\.Vector3\(1\.78, 0, 0\.38\)/,
  );
  assert.match(
    world,
    /"seat-4":\s*new THREE\.Vector3\(1\.78, 0, 0\.38\)/,
  );
  assert.match(world, /"seat-4": 0\.13/);
  assert.match(
    world,
    /seat\.status === "working" && entry\.seatId !== "queue"/,
  );

  const seat4Case = world.slice(
    world.indexOf("case FOLDING_LAPTOP_STATION_OBSTACLE.id:"),
    world.indexOf("case DESK_OBSTACLE.id:"),
  );
  assert.match(seat4Case, /SEAT_WORLD_POSITIONS\["seat-4"\]/);
  assert.match(seat4Case, /WORLD_TARGETS\.music/);
  assert.doesNotMatch(seat4Case, /keepAnchoredVectorOutsideObstacle/);
});

test("seats 2 and 3 keep their close laptop contact points while working", () => {
  for (const [start, end] of [
    [
      "case TENT_WORKSTATION_OBSTACLE.id:",
      "case ROUND_LAPTOP_STATION_OBSTACLE.id:",
    ],
    [
      "case ROUND_LAPTOP_STATION_OBSTACLE.id:",
      "case FOLDING_LAPTOP_STATION_OBSTACLE.id:",
    ],
  ]) {
    const workstationCase = world.slice(world.indexOf(start), world.indexOf(end));
    assert.doesNotMatch(workstationCase, /keepAnchoredVectorOutsideObstacle/);
  }
  assert.match(world, /"seat-2": 0\.07/);
  assert.match(world, /"seat-3": 0\.08/);
});

test("working-seat preview is local-only and can inspect every workstation", () => {
  assert.match(world, /requestedWorkPreviewSeatId = \[/);
  assert.match(world, /requestedWorkPreviewSeatId !== null/);
  assert.match(world, /window\.location\.hostname/);
  assert.match(
    world,
    /requestedWorkPreviewSeatId === "seat-2" \? "working" : "idle"/,
  );
  assert.match(
    world,
    /requestedWorkPreviewSeatId === "seat-3" \? "working" : "idle"/,
  );
  assert.match(
    world,
    /requestedWorkPreviewSeatId === "seat-4" \? "working" : "idle"/,
  );
  assert.match(
    world,
    /activeSeatCountRef\.current = localWorkPreviewEnabled \? 4 : activeSeatCount/,
  );
});

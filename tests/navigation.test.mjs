import assert from "node:assert/strict";
import test from "node:test";
import {
  findAvoidancePath2D,
  segmentIntersectsObstacle2D,
} from "../app/navigation.mjs";

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const moveTowards = (start, destination, step) => {
  const remaining = distance(start, destination);
  if (remaining <= step) return { ...destination };
  return {
    x: start.x + ((destination.x - start.x) / remaining) * step,
    z: start.z + ((destination.z - start.z) / remaining) * step,
  };
};

const isInside = (point, obstacle) =>
  point.x > obstacle.minX &&
  point.x < obstacle.maxX &&
  point.z > obstacle.minZ &&
  point.z < obstacle.maxZ;

test("returns no detour when the direct path is clear", () => {
  const route = findAvoidancePath2D(
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    [{ minX: 1, maxX: 3, minZ: 2, maxZ: 3 }],
  );
  assert.deepEqual(route, []);
});

test("builds a multi-corner route around a blocking object", () => {
  const obstacle = {
    id: "desk",
    minX: 1,
    maxX: 3,
    minZ: -1,
    maxZ: 1,
  };
  const start = { x: 0, z: 0 };
  const destination = { x: 4, z: 0 };
  const route = findAvoidancePath2D(
    start,
    destination,
    [obstacle],
  );

  assert.ok(route.length >= 2);
  const points = [start, ...route, destination];
  for (let index = 0; index < points.length - 1; index += 1) {
    assert.equal(
      segmentIntersectsObstacle2D(
        points[index],
        points[index + 1],
        obstacle,
      ),
      false,
    );
  }
});

test("replans past consecutive obstacles without entering them", () => {
  const obstacles = [
    {
      id: "desk",
      minX: 1,
      maxX: 2.4,
      minZ: -0.8,
      maxZ: 0.8,
    },
    {
      id: "rocks",
      minX: 3.1,
      maxX: 4.1,
      minZ: 0.55,
      maxZ: 1.65,
    },
  ];
  const destination = { x: 5.2, z: 1.1 };
  let position = { x: 0, z: 0 };
  let waypoints = [];

  for (let frame = 0; frame < 2000; frame += 1) {
    while (
      waypoints.length > 0 &&
      distance(position, waypoints[0]) <= 0.055
    ) {
      waypoints.shift();
    }
    if (waypoints.length === 0) {
      waypoints = findAvoidancePath2D(
        position,
        destination,
        obstacles,
      );
    }

    const goal = waypoints[0] ?? destination;
    position = moveTowards(position, goal, 0.035);
    assert.equal(
      obstacles.some((obstacle) => isInside(position, obstacle)),
      false,
    );
    if (distance(position, destination) <= 0.04) break;
  }

  assert.ok(distance(position, destination) <= 0.04);
});

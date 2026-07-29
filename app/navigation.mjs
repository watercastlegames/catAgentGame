function isInsideObstacle2D(point, obstacle) {
  return (
    point.x > obstacle.minX &&
    point.x < obstacle.maxX &&
    point.z > obstacle.minZ &&
    point.z < obstacle.maxZ
  );
}

function nearestExitCandidates(point, obstacle, clearance) {
  return [
    {
      x: obstacle.minX - clearance,
      z: point.z,
    },
    {
      x: obstacle.maxX + clearance,
      z: point.z,
    },
    {
      x: point.x,
      z: obstacle.minZ - clearance,
    },
    {
      x: point.x,
      z: obstacle.maxZ + clearance,
    },
  ];
}

export function resolvePointOutsideObstacles2D(
  point,
  obstacles,
  clearance = 0.06,
) {
  let resolved = {
    x: point.x,
    z: point.z,
  };
  const maximumPasses = Math.max(1, obstacles.length * 4);

  for (let pass = 0; pass < maximumPasses; pass += 1) {
    const containingObstacle = obstacles.find((obstacle) =>
      isInsideObstacle2D(resolved, obstacle),
    );
    if (!containingObstacle) return resolved;

    const candidates = nearestExitCandidates(
      resolved,
      containingObstacle,
      clearance,
    ).sort((a, b) => distanceBetween(resolved, a) - distanceBetween(resolved, b));
    const clearCandidate = candidates.find((candidate) =>
      obstacles.every(
        (obstacle) => !isInsideObstacle2D(candidate, obstacle),
      ),
    );
    resolved = clearCandidate ?? candidates[0];
  }

  return resolved;
}

export function segmentIntersectsObstacle2D(start, end, obstacle) {
  if (
    isInsideObstacle2D(start, obstacle) ||
    isInsideObstacle2D(end, obstacle)
  ) {
    return true;
  }

  let minimumTime = 0;
  let maximumTime = 1;
  const axes = [
    {
      start: start.x,
      delta: end.x - start.x,
      minimum: obstacle.minX,
      maximum: obstacle.maxX,
    },
    {
      start: start.z,
      delta: end.z - start.z,
      minimum: obstacle.minZ,
      maximum: obstacle.maxZ,
    },
  ];

  for (const axis of axes) {
    if (Math.abs(axis.delta) < 1e-6) {
      if (axis.start <= axis.minimum || axis.start >= axis.maximum) {
        return false;
      }
      continue;
    }

    const inverseDelta = 1 / axis.delta;
    let nearTime = (axis.minimum - axis.start) * inverseDelta;
    let farTime = (axis.maximum - axis.start) * inverseDelta;
    if (nearTime > farTime) {
      [nearTime, farTime] = [farTime, nearTime];
    }
    minimumTime = Math.max(minimumTime, nearTime);
    maximumTime = Math.min(maximumTime, farTime);
    if (minimumTime > maximumTime) return false;
  }

  return maximumTime > 0 && minimumTime < 1;
}

function expandObstacle(obstacle, margin) {
  return {
    ...obstacle,
    minX: obstacle.minX - margin,
    maxX: obstacle.maxX + margin,
    minZ: obstacle.minZ - margin,
    maxZ: obstacle.maxZ + margin,
  };
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distanceToObstacle(point, obstacle) {
  const closestX = Math.min(
    obstacle.maxX,
    Math.max(obstacle.minX, point.x),
  );
  const closestZ = Math.min(
    obstacle.maxZ,
    Math.max(obstacle.minZ, point.z),
  );
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

export function findAvoidancePath2D(
  start,
  destination,
  obstacles,
  margin = 0.28,
) {
  const blockingObstacle = obstacles
    .map((obstacle) => ({
      obstacle,
      expanded: expandObstacle(obstacle, margin * 0.72),
    }))
    .filter(({ expanded }) =>
      segmentIntersectsObstacle2D(start, destination, expanded),
    )
    .sort(
      (a, b) =>
        distanceToObstacle(start, a.expanded) -
        distanceToObstacle(start, b.expanded),
    )[0];
  if (!blockingObstacle) return [];

  const { obstacle } = blockingObstacle;
  const corners = [
    {
      x: obstacle.minX - margin,
      z: obstacle.minZ - margin,
    },
    {
      x: obstacle.maxX + margin,
      z: obstacle.minZ - margin,
    },
    {
      x: obstacle.maxX + margin,
      z: obstacle.maxZ + margin,
    },
    {
      x: obstacle.minX - margin,
      z: obstacle.maxZ + margin,
    },
  ];
  const candidateRoutes = [];
  corners.forEach((corner, index) => {
    candidateRoutes.push([corner]);
    candidateRoutes.push([
      corner,
      corners[(index + 1) % corners.length],
    ]);
    candidateRoutes.push([
      corner,
      corners[(index + corners.length - 1) % corners.length],
    ]);
    candidateRoutes.push([
      corner,
      corners[(index + 1) % corners.length],
      corners[(index + 2) % corners.length],
    ]);
    candidateRoutes.push([
      corner,
      corners[(index + corners.length - 1) % corners.length],
      corners[(index + 2) % corners.length],
    ]);
  });

  const validationObstacle = expandObstacle(obstacle, margin * 0.72);
  let bestRoute = [];
  let bestCost = Number.POSITIVE_INFINITY;

  for (const route of candidateRoutes) {
    const points = [start, ...route, destination];
    const clearsBlockingObstacle = points
      .slice(0, -1)
      .every(
        (point, index) =>
          !segmentIntersectsObstacle2D(
            point,
            points[index + 1],
            validationObstacle,
          ),
      );
    if (!clearsBlockingObstacle) continue;

    const routeSegments = [start, ...route];
    const crossesAnotherObstacle = routeSegments
      .slice(0, -1)
      .some((point, index) =>
        obstacles.some(
          (otherObstacle) =>
            otherObstacle !== obstacle &&
            segmentIntersectsObstacle2D(
              point,
              routeSegments[index + 1],
              expandObstacle(otherObstacle, margin * 0.72),
            ),
        ),
      );
    if (crossesAnotherObstacle) continue;

    let cost = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      cost += distanceBetween(points[index], points[index + 1]);
    }
    cost += route.length * 0.04;
    if (cost < bestCost) {
      bestCost = cost;
      bestRoute = route.map((point) => ({ ...point }));
    }
  }

  if (bestRoute.length > 0) return bestRoute;

  const fallbackCorner = corners
    .filter((corner) =>
      obstacles.every(
        (otherObstacle) =>
          otherObstacle === obstacle ||
          !isInsideObstacle2D(
            corner,
            expandObstacle(otherObstacle, margin * 0.72),
          ),
      ),
    )
    .sort(
      (a, b) =>
        distanceBetween(start, a) +
        distanceBetween(a, destination) -
        (distanceBetween(start, b) +
          distanceBetween(b, destination)),
    )[0];

  return fallbackCorner ? [{ ...fallbackCorner }] : [];
}

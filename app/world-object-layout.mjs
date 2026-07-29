export const WORLD_OBJECT_LAYOUT_STORAGE_KEY = "agent-forest-world-object-layout-v1";

// 관리자가 배치 저장 후 확정한 좌표는 이 객체에 반영한다.
// 일반 사용자는 브라우저별 localStorage 대신 이 값을 공통 기본 배치로 사용한다.
export const HARD_CODED_WORLD_OBJECT_LAYOUT = Object.freeze({});

const WORLD_LAYOUT_ADMIN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export function isWorldLayoutAdminHost(hostname) {
  return WORLD_LAYOUT_ADMIN_HOSTS.has(String(hostname ?? "").toLowerCase());
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseWorldObjectLayout(raw) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        if (
          !value ||
          typeof value !== "object" ||
          Array.isArray(value) ||
          !isFiniteNumber(value.x) ||
          !isFiniteNumber(value.z) ||
          !isFiniteNumber(value.rotationY)
        ) {
          return [];
        }

        return [
          [
            id,
            {
              x: value.x,
              z: value.z,
              rotationY: value.rotationY,
            },
          ],
        ];
      }),
    );
  } catch {
    return {};
  }
}

export function transformWorldPoint(basePoint, initialPose, currentPose) {
  const deltaRotation = currentPose.rotationY - initialPose.rotationY;
  const cos = Math.cos(deltaRotation);
  const sin = Math.sin(deltaRotation);
  const offsetX = basePoint.x - initialPose.x;
  const offsetZ = basePoint.z - initialPose.z;

  return {
    x: currentPose.x + offsetX * cos + offsetZ * sin,
    z: currentPose.z - offsetX * sin + offsetZ * cos,
  };
}

export function transformObstacleBounds(baseBounds, initialPose, currentPose) {
  const deltaRotation = currentPose.rotationY - initialPose.rotationY;
  const cos = Math.cos(deltaRotation);
  const sin = Math.sin(deltaRotation);
  const halfX = (baseBounds.maxX - baseBounds.minX) / 2;
  const halfZ = (baseBounds.maxZ - baseBounds.minZ) / 2;
  const center = transformWorldPoint(
    {
      x: (baseBounds.minX + baseBounds.maxX) / 2,
      z: (baseBounds.minZ + baseBounds.maxZ) / 2,
    },
    initialPose,
    currentPose,
  );
  const rotatedHalfX = Math.abs(cos) * halfX + Math.abs(sin) * halfZ;
  const rotatedHalfZ = Math.abs(sin) * halfX + Math.abs(cos) * halfZ;

  return {
    minX: center.x - rotatedHalfX,
    maxX: center.x + rotatedHalfX,
    minZ: center.z - rotatedHalfZ,
    maxZ: center.z + rotatedHalfZ,
  };
}

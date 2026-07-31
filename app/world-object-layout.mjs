export const WORLD_OBJECT_LAYOUT_STORAGE_KEY = "agent-forest-world-object-layout-v1";
export const MAX_CARE_FACILITY_COUNT = 2;
export const CARE_FACILITY_LAYOUT_IDS = Object.freeze({
  food: Object.freeze(["cat-food-bowl", "cat-food-bowl-2"]),
  toilet: Object.freeze([
    "covered-cat-litter-box",
    "covered-cat-litter-box-2",
  ]),
});

// 관리자가 배치 저장 후 확정한 좌표는 이 객체에 반영한다.
// 일반 사용자는 브라우저별 localStorage 대신 이 값을 공통 기본 배치로 사용한다.
export const HARD_CODED_WORLD_OBJECT_LAYOUT = Object.freeze({
  "camping-supply-cluster": {
    x: -2.3353347287062527,
    z: 3.4971086976431813,
    rotationY: 0.12,
  },
  "cat-food-bowl": {
    x: 0.9489761437078331,
    z: -4.880297227790361,
    rotationY: -0.18,
  },
  "covered-cat-litter-box": {
    x: 1.909461366243032,
    z: -4.51832047983328,
    rotationY: -0.4217993877991494,
  },
  "folding-laptop-radio-workstation": {
    x: 2.4082644104533757,
    z: -0.43350837065160897,
    rotationY: -0.3817993877991494,
  },
  "foliage-northeast": {
    x: 3.25,
    z: -3.2,
    rotationY: -0.48,
  },
  "foliage-northwest": {
    x: -3.35,
    z: -3.1,
    rotationY: 0.28,
  },
  "foliage-southeast": {
    x: 3.32,
    z: 4.82,
    rotationY: -0.72,
  },
  "foliage-southwest": {
    x: -3.4,
    z: 4.72,
    rotationY: 0.58,
  },
  "low-monitor-workstation": {
    x: 2.12,
    z: 3.42,
    rotationY: -0.3217993877991494,
  },
  "palm-tree-northeast": {
    x: 3.55,
    z: -4.55,
    rotationY: -0.78,
  },
  "palm-tree-northwest": {
    x: -3.55,
    z: -4.85,
    rotationY: 0.78,
  },
  "palm-tree-southwest": {
    x: -3.75,
    z: 3.95,
    rotationY: 0.78,
  },
  "round-laptop-workstation": {
    x: -2.494631976377163,
    z: -0.46668340734869673,
    rotationY: 0.08,
  },
  "shore-rocks-east": {
    x: 3.82,
    z: 1.65,
    rotationY: -0.35,
  },
  "shore-rocks-north": {
    x: -2.7,
    z: -5.65,
    rotationY: -0.16,
  },
  "shore-rocks-south": {
    x: 3.25,
    z: 5.45,
    rotationY: 0.52,
  },
  "shore-rocks-west": {
    x: -3.85,
    z: -0.8,
    rotationY: 0.2,
  },
  "shoreline-decoration-southeast": {
    x: 2.82,
    z: 5.52,
    rotationY: -0.42,
  },
  "shoreline-decoration-southwest": {
    x: -2.78,
    z: 5.58,
    rotationY: 0.38,
  },
  "tent-workstation": {
    x: -1.3283313098701015,
    z: -4.226114884521053,
    rotationY: 0.08000000000000002,
  },
});

// Purchased facilities keep the administrator-approved pose without becoming
// part of the free default layout. Ownership decides whether these are spawned.
export const EXTRA_CARE_FACILITY_DEFAULT_POSES = Object.freeze({
  "cat-food-bowl-2": {
    x: 0.2919061318912837,
    z: -4.921080985354045,
    rotationY: 0.12,
  },
  "covered-cat-litter-box-2": {
    x: 2.816903381150222,
    z: -3.7428912544515436,
    rotationY: -0.6053981633974482,
  },
});

// Purchasable world decorations are registered in placement mode before they
// are owned, but stay hidden for players until purchase. Their default pose is
// kept separate from the free common layout so ownership remains authoritative.
export const PURCHASABLE_WORLD_OBJECT_DEFAULT_POSES = Object.freeze({
  "cat-exercise-wheel": {
    x: 0,
    z: 3.72,
    rotationY: -0.28,
  },
});

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

export function countCareFacilities(layout, intent) {
  const ids = CARE_FACILITY_LAYOUT_IDS[intent];
  if (!ids) return 0;

  return Math.min(
    MAX_CARE_FACILITY_COUNT,
    1 + (layout && Object.hasOwn(layout, ids[1]) ? 1 : 0),
  );
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

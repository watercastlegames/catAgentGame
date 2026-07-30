export type WorldObjectPose = {
  x: number;
  z: number;
  rotationY: number;
};

export type WorldObjectLayout = Record<string, WorldObjectPose>;

export type WorldObjectBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const WORLD_OBJECT_LAYOUT_STORAGE_KEY: string;
export const HARD_CODED_WORLD_OBJECT_LAYOUT: Readonly<WorldObjectLayout>;
export const MAX_CARE_FACILITY_COUNT: 2;
export const CARE_FACILITY_LAYOUT_IDS: Readonly<{
  food: readonly ["cat-food-bowl", "cat-food-bowl-2"];
  toilet: readonly [
    "covered-cat-litter-box",
    "covered-cat-litter-box-2",
  ];
}>;

export function isWorldLayoutAdminHost(hostname: string): boolean;

export function parseWorldObjectLayout(raw: string | null): WorldObjectLayout;

export function countCareFacilities(
  layout: WorldObjectLayout,
  intent: "food" | "toilet",
): number;

export function transformWorldPoint(
  basePoint: Pick<WorldObjectPose, "x" | "z">,
  initialPose: WorldObjectPose,
  currentPose: WorldObjectPose,
): Pick<WorldObjectPose, "x" | "z">;

export function transformObstacleBounds(
  baseBounds: WorldObjectBounds,
  initialPose: WorldObjectPose,
  currentPose: WorldObjectPose,
): WorldObjectBounds;
